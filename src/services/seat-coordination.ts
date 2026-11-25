import "server-only";

import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { getRedis } from "@/lib/redis";
import { ReservationError } from "@/services/reservation-error";
import type { ReservationView } from "@/types/booking";

type SeatCoordinates = { workspaceId: string; slotId: string; seatIds: string[] };

const coordinationTtlMs = 8_000;
const releaseIfOwned = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

export function seatLockKey(workspaceId: string, seatId: string, slotId: string) {
  return `seat-lock:${workspaceId}:${seatId}:${slotId}`;
}

export function holdHintKey(reservationId: string) {
  return `reservation-hold:${reservationId}`;
}

export function releaseSeatLock(redis: Redis, key: string, token: string) {
  return redis.eval(releaseIfOwned, 1, key, token);
}

export async function withSeatCoordination<T>(
  scope: SeatCoordinates | (() => Promise<SeatCoordinates>),
  run: (redis: Redis | null) => Promise<T>,
  useDatabaseOnContention = false,
) {
  const redis = await getRedis("coordination");
  if (!redis) return run(null);

  const { workspaceId, slotId, seatIds } = typeof scope === "function" ? await scope() : scope;
  const keys = [...new Set(seatIds)].map((id) => seatLockKey(workspaceId, id, slotId)).sort();
  const token = randomUUID();
  const attempted: string[] = [];
  const started = performance.now();
  const release = () => Promise.allSettled(attempted.map((key) => releaseSeatLock(redis, key, token)));

  try {
    for (const key of keys) {
      // A timeout can occur after Redis accepts SET. The release script still checks the token.
      attempted.push(key);
      if (await redis.set(key, token, "PX", coordinationTtlMs, "NX") !== "OK") {
        throw new ReservationError("SEAT_COORDINATION_BUSY");
      }
    }
  } catch (error) {
    await release();
    if (error instanceof ReservationError && !useDatabaseOnContention) throw error;
    return run(null);
  }

  if (performance.now() - started >= coordinationTtlMs) {
    await release();
    return run(null);
  }

  try {
    return await run(redis);
  } finally {
    await release();
  }
}

export async function publishHoldHint(redis: Redis | null, hold: ReservationView) {
  if (!redis) return;
  // PostgreSQL has already committed. This hint may disappear and grants no ownership.
  await redis.set(holdHintKey(hold.id), "HELD", "PXAT", Date.parse(hold.expiresAt)).catch(() => {});
}

export async function removeHoldHint(redis: Redis | null, reservationId: string) {
  if (!redis) return;
  await redis.del(holdHintKey(reservationId)).catch(() => {});
}
