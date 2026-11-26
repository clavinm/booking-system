import "server-only";

import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { appInstanceId } from "@/lib/app-instance";
import { db } from "@/lib/database";
import { getRedis } from "@/lib/redis";
import { createLabInventory, removeLabInventory } from "@/repositories/lab-fixture";
import { idempotencyRequest } from "@/services/idempotency";
import { ReservationError } from "@/services/reservation-error";
import { createHold } from "@/services/reservations";
import { releaseSeatLock, removeHoldHint, withSeatCoordination, seatLockKey } from "@/services/seat-coordination";
import type { LabEvent, LabResult, LabScenario } from "@/types/engineering";

type RecordEvent = (request: string, detail: string) => void;

async function compareWrites(record: RecordEvent) {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`CREATE TEMP TABLE engineering_probe (stock integer, version integer) ON COMMIT DROP`;
    await tx.$executeRaw`INSERT INTO engineering_probe VALUES (1, 0)`;
    const [before] = await tx.$queryRaw<{ stock: number; version: number }[]>`SELECT * FROM engineering_probe`;
    record("A and B", `Both decisions start from the same snapshot. Stock ${before.stock}, version ${before.version}.`);
    if (process.env.NODE_ENV === "development") {
      // This table is connection-private and disappears when the transaction ends.
      const acceptStaleDecision = () => tx.$executeRaw`UPDATE engineering_probe SET stock = stock - 1`;
      const a = await acceptStaleDecision();
      const b = await acceptStaleDecision();
      const [after] = await tx.$queryRaw<{ stock: number }[]>`SELECT stock FROM engineering_probe`;
      record("Unprotected writes", `Both writes accepted (${a} + ${b} updates for one unit). Stock fell to ${after.stock}.`);
      await tx.$executeRaw`UPDATE engineering_probe SET stock = ${before.stock}, version = ${before.version}`;
    }
    const apply = () => tx.$executeRaw`
      UPDATE engineering_probe SET stock = stock - 1, version = version + 1
      WHERE version = ${before.version} AND stock > 0
    `;
    const first = await apply();
    record("A", `Atomic version check and update affected ${first} row.`);
    const second = await apply();
    record("B", `Using the original version affected ${second} rows. The database rejected the stale write.`);
    return { conflicts: 1 - second, summary: "Both readers saw availability. PostgreSQL let only one change the row." };
  });
}

async function waitForRow(record: RecordEvent) {
  const fixture = await createLabInventory(1);
  const locked = Promise.withResolvers<void>();
  const followerStarted = Promise.withResolvers<void>();

  try {
    const leader = db().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Seat" WHERE id = ${fixture.seatId}::uuid FOR UPDATE`;
      record("A", "Acquired the PostgreSQL row lock.");
      locked.resolve();
      await followerStarted.promise;
      await sleep(250);
      record("A", "Returning from the transaction to commit and release the lock.");
    }).catch((error: unknown) => { locked.reject(error); throw error; });

    const follower = (async () => {
      await locked.promise;
      const begin = performance.now();
      record("B", "Requested the same row lock.");
      followerStarted.resolve();
      await db().$transaction((tx) => tx.$queryRaw`SELECT id FROM "Seat" WHERE id = ${fixture.seatId}::uuid FOR UPDATE`);
      const wait = Math.round(performance.now() - begin);
      record("B", `Acquired the row after ${wait} ms.`);
      return wait;
    })();
    const results = await Promise.allSettled([leader, follower]);
    for (const result of results) if (result.status === "rejected") throw result.reason;
    return { conflicts: 0, summary: "Request B waited for A to release the row before it could continue." };
  } finally {
    await removeLabInventory(fixture.id);
  }
}

async function inspectRedis(record: RecordEvent) {
  const scope = { workspaceId: `engineering-${randomUUID()}`, slotId: "slot", seatIds: ["seat"] };
  const key = seatLockKey(scope.workspaceId, "seat", scope.slotId);
  const result = await withSeatCoordination(scope, async (redis) => {
    if (!redis) return { conflicts: 0, summary: "Redis is unavailable. SeatSync can still use PostgreSQL for reservation correctness." };
    const ttlMs = await redis.pttl(key);
    record("A", `Acquired a Redis coordination lock. Measured TTL ${ttlMs} ms.`);
    const contender = await redis.set(key, randomUUID(), "PX", 8_000, "NX");
    record("B", contender === null ? "SET NX refused a competing lock." : "Acquired the key after its lease ended.");
    const removed = await releaseSeatLock(redis, key, randomUUID());
    record("B", `Release with a different token removed ${String(removed)} keys.`);
    return { ttlMs, conflicts: Number(contender === null), summary: "Redis checks lock ownership before deleting a coordination key." };
  });

  const redis = await getRedis("coordination");
  if (redis && "ttlMs" in result) {
    const remaining = await redis.exists(key);
    record("A", remaining === 0 ? "The owner released the lease. Redis reports no key." : "Redis reports a lease still present.");
    const expiryKey = `${key}:expiry`;
    await redis.set(expiryKey, "expiry-example", "PX", 10_000);
    const ttl = await redis.pttl(expiryKey);
    record("Redis", `A second key demonstrates expiry. Redis reports ${ttl} ms remaining.`);
    return { ...result, expiresAt: Date.now() + ttl };
  }
  return result;
}

async function raceHolds(record: RecordEvent, replay: boolean) {
  const fixture = await createLabInventory(1);
  let members: { id: string }[] = [];
  try {
    members = await db().user.createManyAndReturn({
      data: Array.from({ length: 2 }, (_, index) => ({
        name: `Lab request ${index + 1}`, email: `${randomUUID()}@lab.example.test`, passwordHash: "disabled-lab-account",
      })),
      select: { id: true },
    });
    const input = { workspaceId: fixture.workspaceId, slotId: fixture.slots[0].id, seatIds: [fixture.seatId] };
    const first = members[0].id;
    const key = replay ? idempotencyRequest(first, "HOLD", randomUUID(), input) : undefined;
    const requests = await Promise.allSettled(["A", "B"].map(async (name, index) => {
      const user = replay ? first : members[index].id;
      const start = performance.now();
      record(name, replay ? "Submitted the same idempotency key and seat." : "Requested the same seat and time slot.");
      try {
        const hold = await createHold(user, input, key);
        record(name, `Hold returned in ${Math.round(performance.now() - start)} ms.`);
        return hold.id;
      } catch (error) {
        if (!(error instanceof ReservationError) || !["SEAT_CONFLICT", "SEAT_COORDINATION_BUSY"].includes(error.code)) throw error;
        record(name, `${error.code} after ${Math.round(performance.now() - start)} ms.`);
        return null;
      }
    }));
    const outcomes = requests.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    const count = await db().reservation.count({ where: { workspaceId: fixture.id } });
    const accepted = outcomes.filter(Boolean);
    if (count !== 1 || accepted.length !== (replay ? 2 : 1) || new Set(accepted).size !== 1) {
      throw new Error("Reservation invariant failed in the isolated lab.");
    }
    record("PostgreSQL", `Found ${count} persisted hold${replay ? " and both responses referenced it" : ""}.`);
    return { conflicts: outcomes.length - accepted.length, summary: replay
      ? "Two requests shared one result and created one reservation."
      : "One request held the seat. The competing request received a conflict." };
  } finally {
    const redis = await getRedis("coordination");
    if (redis) {
      const holds = await db().reservation.findMany({ where: { workspaceId: fixture.id }, select: { id: true } });
      await Promise.all(holds.map(({ id }) => removeHoldHint(redis, id)));
    }
    await removeLabInventory(fixture.id, members.map(({ id }) => id));
  }
}

export async function runEngineeringLab(scenario: LabScenario): Promise<LabResult> {
  const start = performance.now();
  const events: LabEvent[] = [];
  const record = (request: string, detail: string) => events.push({ atMs: Math.round(performance.now() - start), request, detail });
  let result: Pick<LabResult, "summary" | "conflicts" | "ttlMs" | "expiresAt">;
  switch (scenario) {
    case "redis": result = await inspectRedis(record); break;
    case "optimistic": result = await compareWrites(record); break;
    case "pessimistic": result = await waitForRow(record); break;
    case "race":
    case "idempotency": result = await raceHolds(record, scenario === "idempotency"); break;
  }
  return { instance: appInstanceId(), elapsedMs: Math.round(performance.now() - start), events, ...result };
}
