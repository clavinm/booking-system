import nextEnv from "@next/env";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

nextEnv.loadEnvConfig(process.cwd());
// Unit tests never use someone’s configured hosted Redis. Integration tests opt in to disposable local Redis.
process.env.REDIS_URL = "";
process.env.REDIS_CACHE_URL = "";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
