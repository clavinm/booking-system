import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { invalidateCatalogCache, withCatalogCache } from "@/lib/catalog-cache";
import { db } from "@/lib/database";
import { disconnectRedis } from "@/lib/redis";
import { cancelReservation, createHold, getReservation } from "@/services/reservations";
import { reservationRateKey, reservationRetryAfter } from "@/services/reservation-rate-limit";
import { holdHintKey, releaseSeatLock, seatLockKey, withSeatCoordination } from "@/services/seat-coordination";

vi.mock("server-only", () => ({}));

const coordinationUrl = process.env.SEATSYNC_TEST_REDIS_URL;
const cacheUrl = process.env.SEATSYNC_TEST_REDIS_CACHE_URL;
const localRedis = (value: string) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);

describe.runIf(process.env.SEATSYNC_INTEGRATION === "1" && Boolean(coordinationUrl))("Redis coordination and PostgreSQL ownership", () => {
  let redis: Redis;
  const fixtureKeys = new Set<string>();
  const users: string[] = [];

  beforeAll(async () => {
    if (!coordinationUrl || !localRedis(coordinationUrl) || (cacheUrl && !localRedis(cacheUrl))) {
      throw new Error("Run Redis integration tests against disposable localhost Redis instances.");
    }
    redis = new Redis(coordinationUrl, { lazyConnect: true, retryStrategy: () => null });
    await redis.connect();
  });

  afterEach(() => {
    disconnectRedis("coordination");
    disconnectRedis("cache");
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    if (redis) {
      for (const key of fixtureKeys) await redis.del(key);
      redis.disconnect();
    }
    if (users.length) {
      const ids = (await db().reservation.findMany({ where: { userId: { in: users } }, select: { id: true } })).map(({ id }) => id);
      await db().$transaction([
        db().seatSlot.updateMany({ where: { holdReservationId: { in: ids } }, data: { holdReservationId: null, holdExpiresAt: null } }),
        db().reservationItem.deleteMany({ where: { reservationId: { in: ids } } }),
        db().reservation.deleteMany({ where: { id: { in: ids } } }),
        db().user.deleteMany({ where: { id: { in: users } } }),
      ]);
      await db().$disconnect();
    }
  });

  function coordinate() {
    vi.stubEnv("REDIS_URL", coordinationUrl);
  }

  async function testUser() {
    const { id } = await db().user.create({
      data: { email: `redis-${randomUUID()}@example.test`, name: "Redis test", passwordHash: "unusable-test-placeholder" },
      select: { id: true },
    });
    users.push(id);
    return id;
  }

  it("leaves a replacement lease intact when the original owner tries to release it late", async () => {
    const key = seatLockKey("redis-test", randomUUID(), randomUUID());
    fixtureKeys.add(key);
    await redis.set(key, "original-owner", "PX", 65, "NX");
    await vi.waitFor(async () => expect(await redis.get(key)).toBeNull(), { interval: 20, timeout: 1_000 });
    await redis.set(key, "replacement-owner", "PX", 5_000, "NX");

    await expect(releaseSeatLock(redis, key, "original-owner")).resolves.toBe(0);
    await expect(redis.get(key)).resolves.toBe("replacement-owner");
    await expect(releaseSeatLock(redis, key, "replacement-owner")).resolves.toBe(1);
  });

  it("releases its partially acquired group and preserves the competing client’s lease", async () => {
    coordinate();
    const scope = { workspaceId: "redis-tests", slotId: randomUUID(), seatIds: ["b", "a"] };
    const first = seatLockKey(scope.workspaceId, "a", scope.slotId);
    const second = seatLockKey(scope.workspaceId, "b", scope.slotId);
    fixtureKeys.add(first);
    fixtureKeys.add(second);
    await redis.set(second, "another-owner", "PX", 5_000, "NX");
    const run = vi.fn(async () => "committed");

    await expect(withSeatCoordination(scope, run)).rejects.toMatchObject({ code: "SEAT_COORDINATION_BUSY" });
    expect(run).not.toHaveBeenCalled();
    await expect(redis.get(first)).resolves.toBeNull();
    await expect(redis.get(second)).resolves.toBe("another-owner");
  });

  it("publishes a post-commit TTL hint and preserves database ownership when Redis loses the hint and goes offline", async () => {
    coordinate();
    const [owner, visitor] = await Promise.all([testUser(), testUser()]);
    const row = await db().seatSlot.findFirstOrThrow({
      where: { timeSlot: { startsAt: { gt: new Date(Date.now() + 86_400_000) } } },
      select: { seatId: true, timeSlotId: true, timeSlot: { select: { workspace: { select: { slug: true } } } } },
    });
    const input = { workspaceId: row.timeSlot.workspace.slug, slotId: row.timeSlotId, seatIds: [row.seatId] };
    const hold = await createHold(owner, input);
    const key = holdHintKey(hold.id);
    fixtureKeys.add(key);
    expect(await redis.get(key)).toBe("HELD");
    const ttl = await redis.pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(Math.abs(ttl - (Date.parse(hold.expiresAt) - Date.now()))).toBeLessThan(500);
    await expect(redis.get(seatLockKey(input.workspaceId, row.seatId, row.timeSlotId))).resolves.toBeNull();

    await expect(cancelReservation(hold.id, visitor)).rejects.toMatchObject({ status: 404 });
    await expect(redis.get(key)).resolves.toBe("HELD");
    await redis.del(key);
    disconnectRedis("coordination");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");
    await expect(getReservation(hold.id, owner)).resolves.toMatchObject({ status: "HELD" });
    await expect(createHold(visitor, input)).rejects.toMatchObject({ code: "SEAT_CONFLICT" });
    await expect(cancelReservation(hold.id, visitor)).rejects.toMatchObject({ status: 404 });
    await expect(cancelReservation(hold.id, owner)).resolves.toMatchObject({ status: "CANCELLED" });
    const replacement = await createHold(visitor, input);
    expect(replacement.status).toBe("HELD");

    coordinate();
    await cancelReservation(replacement.id, visitor);
    const secondHold = await createHold(owner, input);
    const secondKey = holdHintKey(secondHold.id);
    fixtureKeys.add(secondKey);
    expect(await redis.get(secondKey)).toBe("HELD");
    await cancelReservation(secondHold.id, owner);
    await expect(redis.get(secondKey)).resolves.toBeNull();
  });

  it("shares a short-lived write limit by user and reports a retry delay", async () => {
    coordinate();
    const userId = randomUUID();
    const key = reservationRateKey(userId);
    fixtureKeys.add(key);

    const first = await Promise.all(Array.from({ length: 30 }, () => reservationRetryAfter(userId)));
    expect(first).toEqual(Array(30).fill(0));
    await expect(reservationRetryAfter(userId)).resolves.toBeGreaterThan(0);
    await expect(redis.get(key)).resolves.toBe("31");
    expect(await redis.pttl(key)).toBeLessThanOrEqual(60_000);
  });

  it.skipIf(!cacheUrl)("loads cached catalog data once and switches generations on invalidation", async () => {
    vi.stubEnv("REDIS_CACHE_URL", cacheUrl);
    const query = `redis-test:${randomUUID()}`;
    let counter = 0;
    const load = vi.fn(async () => ({ counter: ++counter }));
    expect(await withCatalogCache(query, 15, load)).toEqual({ counter: 1 });
    expect(await withCatalogCache(query, 15, load)).toEqual({ counter: 1 });
    expect(load).toHaveBeenCalledTimes(1);
    await invalidateCatalogCache();
    expect(await withCatalogCache(query, 15, load)).toEqual({ counter: 2 });
  });
});
