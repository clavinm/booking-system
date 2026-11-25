import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl } from "@/lib/server-env";

export function createDatabaseClient() {
  const url = new URL(databaseUrl());
  const options = url.searchParams.get("options") ?? process.env.PGOPTIONS;
  // Prisma sends Date parameters as zone-less timestamps before PostgreSQL casts them.
  url.searchParams.set("options", [options, "-c timezone=UTC"].filter(Boolean).join(" "));
  const adapter = new PrismaPg({
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

const globalDatabase = globalThis as typeof globalThis & { seatSyncDatabase?: PrismaClient };
let client: PrismaClient | undefined;

export function db() {
  // Reuse the pool across requests and development hot reloads.
  client ??= globalDatabase.seatSyncDatabase ?? createDatabaseClient();
  if (process.env.NODE_ENV !== "production") globalDatabase.seatSyncDatabase = client;
  return client;
}
