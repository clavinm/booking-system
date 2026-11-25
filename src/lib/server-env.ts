import { z } from "zod";

const postgresUrl = z.url({ protocol: /^postgres(?:ql)?$/ });

export function databaseUrl() {
  const result = postgresUrl.safeParse(process.env.DATABASE_URL);
  if (!result.success) throw new Error("Set DATABASE_URL to a valid PostgreSQL connection URL.");
  return result.data;
}

const authEnv = z.object({
  AUTH_SECRET: z.string().trim().min(32),
  AUTH_URL: z.url({ protocol: /^https?$/ }).refine((value) => {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (url.protocol === "https:" || local) && url.pathname === "/" &&
      !url.username && !url.password && !url.search && !url.hash;
  }),
});

export function authSettings() {
  const result = authEnv.safeParse({
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
  });
  if (!result.success) {
    throw new Error("Set AUTH_SECRET (32+ characters) and AUTH_URL (the app origin, using HTTPS outside localhost).");
  }
  return { secret: result.data.AUTH_SECRET, origin: new URL(result.data.AUTH_URL).origin };
}

const holdTtl = z.coerce.number().int().min(1).max(300);

export function reservationTtlSeconds() {
  const result = holdTtl.safeParse(process.env.RESERVATION_TTL_SECONDS || 300);
  if (!result.success) throw new Error("Set RESERVATION_TTL_SECONDS to a whole number from 1 to 300.");
  return result.data;
}

const redisUrl = z.url({ protocol: /^rediss?$/ }).refine((value) => {
  // ioredis decodes these components when opening the connection.
  try {
    const url = new URL(value);
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    return Boolean(url.hostname);
  } catch {
    return false;
  }
});

export function redisConnectionUrl(kind: "coordination" | "cache") {
  const value = kind === "coordination" ? process.env.REDIS_URL : process.env.REDIS_CACHE_URL;
  return redisUrl.safeParse(value?.trim()).data ?? null;
}
