import { afterEach, expect, it, vi } from "vitest";
import { appInstanceId } from "@/lib/app-instance";
import { redisConnectionUrl } from "@/lib/server-env";

afterEach(() => vi.unstubAllEnvs());

it("reads a Redis URL and leaves the cache off when no second URL is supplied", () => {
  vi.stubEnv("REDIS_URL", "rediss://redis.example.test:6380");
  vi.stubEnv("REDIS_CACHE_URL", "");
  expect(redisConnectionUrl("coordination")).toBe("rediss://redis.example.test:6380");
  expect(redisConnectionUrl("cache")).toBeNull();
});

it("treats a pasted CLI command or backslash as an unavailable optional configuration", () => {
  vi.stubEnv("REDIS_URL", "redis-cli -u redis://127.0.0.1:6379");
  vi.stubEnv("REDIS_CACHE_URL", "\\");
  expect(redisConnectionUrl("coordination")).toBeNull();
  expect(redisConnectionUrl("cache")).toBeNull();
});

it("uses explicit instance labels or generates a stable label for this app process", () => {
  vi.stubEnv("APP_INSTANCE_ID", "instance-a");
  expect(appInstanceId()).toBe("instance-a");
  vi.stubEnv("APP_INSTANCE_ID", "");
  const generated = appInstanceId();
  expect(generated).toMatch(/^app-[0-9a-f-]+$/);
  expect(appInstanceId()).toBe(generated);
});
