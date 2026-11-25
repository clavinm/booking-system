import { createHash, randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { io } from "next/cache";
import { getRedis } from "@/lib/redis";

const generationKey = "seatsync:catalog:v1:generation";

async function catalogGeneration(redis: Redis) {
  const current = await redis.get(generationKey);
  if (current) return current;

  const first = randomUUID();
  return await redis.set(generationKey, first, "NX") === "OK" ? first : redis.get(generationKey);
}

export async function withCatalogCache<T>(key: string, ttlSeconds: number, readDatabase: () => Promise<T>): Promise<T> {
  // Prisma and Redis can generate runtime values before their first network response.
  await io();
  const redis = await getRedis("cache");
  if (!redis) return readDatabase();

  let dataKey: string | undefined;
  try {
    const generation = await catalogGeneration(redis);
    if (generation) {
      const hash = createHash("sha256").update(key).digest("hex");
      dataKey = `seatsync:catalog:v1:${generation}:${hash}`;
      const hit = await redis.get(dataKey);
      if (hit !== null) return JSON.parse(hit) as T;
    }
  } catch {
    dataKey = undefined;
  }

  const fresh = await readDatabase();
  if (dataKey && fresh !== null && fresh !== undefined) {
    await redis.set(dataKey, JSON.stringify(fresh), "EX", ttlSeconds).catch(() => {});
  }
  return fresh;
}

export async function invalidateCatalogCache() {
  const redis = await getRedis("cache");
  await redis?.set(generationKey, randomUUID()).catch(() => {});
}
