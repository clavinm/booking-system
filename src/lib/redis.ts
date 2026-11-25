import { Redis } from "ioredis";
import { isIP } from "node:net";
import { redisConnectionUrl } from "@/lib/server-env";

type RedisPurpose = "coordination" | "cache";
type RedisConnection = {
  url: string;
  client?: Redis;
  opening?: Promise<Redis | null>;
  retryAt: number;
};

const processState = globalThis as typeof globalThis & {
  seatSyncRedis?: Partial<Record<RedisPurpose, RedisConnection>>;
};
const connections = processState.seatSyncRedis ??= {};

export function disconnectRedis(purpose: RedisPurpose) {
  connections[purpose]?.client?.disconnect();
  delete connections[purpose];
}

export function getRedis(purpose: RedisPurpose): Promise<Redis | null> {
  const url = redisConnectionUrl(purpose);
  let connection = connections[purpose];

  if (connection?.url !== url) {
    disconnectRedis(purpose);
    connection = undefined;
  }
  if (!url) return Promise.resolve(null);

  const entry = connection ?? { url, retryAt: 0 };
  connections[purpose] = entry;
  if (entry.client?.status === "ready") return Promise.resolve(entry.client);
  if (entry.opening) return entry.opening;
  if (entry.retryAt > Date.now()) return Promise.resolve(null);

  const endpoint = new URL(url);
  const host = endpoint.hostname.replace(/^\[|\]$/g, "");
  const client = new Redis(url, {
    ...(endpoint.protocol === "rediss:" && { tls: { servername: isIP(host) ? undefined : host } }),
    lazyConnect: true,
    enableOfflineQueue: false,
    enableReadyCheck: false,
    disableClientInfo: true,
    connectTimeout: 800,
    commandTimeout: 800,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  entry.client = client;
  client.on("error", () => { /* Optional Redis failures use the PostgreSQL path. */ });
  client.once("end", () => { entry.retryAt = Date.now() + 1_000; });
  entry.opening = client.connect()
    .then(() => client)
    .catch(() => {
      client.disconnect();
      entry.retryAt = Date.now() + 1_000;
      return null;
    })
    .finally(() => { entry.opening = undefined; });
  return entry.opening;
}
