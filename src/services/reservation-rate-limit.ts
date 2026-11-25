import "server-only";

import { getRedis } from "@/lib/redis";

const writeLimit = 30;
const windowMs = 60_000;
const countAttempt = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
  return {count, redis.call('PTTL', KEYS[1])}
`;

export function reservationRateKey(userId: string) {
  return `seatsync:rate:reservation-write:${userId}`;
}

// Zero means the write can go ahead. A positive value is the Retry-After in seconds.
export async function reservationRetryAfter(userId: string) {
  const redis = await getRedis("coordination");
  if (!redis) return 0;

  try {
    const [count, ttl] = await redis.eval(countAttempt, 1, reservationRateKey(userId), windowMs) as number[];
    return count > writeLimit ? Math.max(1, Math.ceil(ttl / 1_000)) : 0;
  } catch {
    return 0;
  }
}
