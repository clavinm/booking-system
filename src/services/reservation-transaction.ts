import "server-only";

import { setTimeout as delay } from "node:timers/promises";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database";
import { ReservationError } from "@/services/reservation-error";

const attempts = 3;
const transientSqlStates = new Set(["40001", "40P01", "55P03"]);

export async function reservationTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  isolationLevel: Prisma.TransactionIsolationLevel = "ReadCommitted",
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await db().$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '1500ms'`;
        return operation(tx);
      }, { isolationLevel, maxWait: 6_000, timeout: 15_000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      const adapterError = error.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined;
      const sqlState = adapterError?.cause?.originalCode ?? error.meta?.code;
      const startTimedOut = error.code === "P2028" && error.message.includes("Unable to start a transaction in the given time");
      const transient = error.code === "P2024" || startTimedOut || error.code === "P2034" ||
        (error.code === "P2010" && typeof sqlState === "string" && transientSqlStates.has(sqlState));
      if (!transient) {
        if (error.code === "P2028") throw new ReservationError("RESERVATION_BUSY");
        throw error;
      }
      if (attempt === attempts - 1) throw new ReservationError("RESERVATION_BUSY");
      await delay(30 * (attempt + 1) + Math.floor(Math.random() * 30));
    }
  }

  throw new ReservationError("RESERVATION_BUSY");
}
