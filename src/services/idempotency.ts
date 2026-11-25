import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database";
import { ReservationError } from "@/services/reservation-error";
import type { ReservationView } from "@/types/booking";

export type IdempotencyRequest = {
  userId: string;
  operation: "HOLD" | "CONFIRM";
  key: string;
  requestHash: string;
};

type ReservationOutcome =
  | { ok: true; data: ReservationView }
  | { ok: false; error: { code: ReservationError["code"]; message: string; unavailableSeatIds?: string[] } };

const retryableErrors = new Set<ReservationError["code"]>([
  "PAYMENT_REQUIRED", "PAYMENT_UNAVAILABLE", "RESERVATION_BUSY", "SEAT_COORDINATION_BUSY",
]);

export function readIdempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key");
  if (key !== null && !/^[\x21-\x7e]{1,128}$/.test(key)) throw new ReservationError("INVALID_IDEMPOTENCY_KEY");
  return key ?? undefined;
}

export function idempotencyRequest(
  userId: string,
  operation: IdempotencyRequest["operation"],
  key: string | undefined,
  payload: unknown,
): IdempotencyRequest | undefined {
  if (!key) return undefined;
  return { userId, operation, key, requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

function identity({ userId, operation, key }: IdempotencyRequest) {
  return { userId_operation_key: { userId, operation, key } };
}

async function readOutcome(tx: Prisma.TransactionClient, request: IdempotencyRequest) {
  const row = await tx.idempotencyKey.findUnique({ where: identity(request) });
  if (!row) return null;
  if (row.requestHash !== request.requestHash) throw new ReservationError("IDEMPOTENCY_KEY_REUSED");
  if (row.status !== "COMPLETED") throw new ReservationError("RESERVATION_BUSY");
  return row.responseBody as ReservationOutcome;
}

export function findIdempotentOutcome(request: IdempotencyRequest | undefined) {
  return request ? readOutcome(db(), request) : Promise.resolve(null);
}

export function reservationOutcome(outcome: ReservationOutcome) {
  if (outcome.ok) return outcome.data;
  throw new ReservationError(outcome.error.code, outcome.error.unavailableSeatIds);
}

function failure(error: ReservationError): ReservationOutcome {
  return {
    ok: false,
    error: { code: error.code, message: error.message, ...(error.unavailableSeatIds && { unavailableSeatIds: error.unavailableSeatIds }) },
  };
}

export async function idempotentReservation(
  tx: Prisma.TransactionClient,
  request: IdempotencyRequest | undefined,
  responseStatus: number,
  run: () => Promise<ReservationView | null>,
) {
  if (!request) {
    const data = await run();
    return { executed: true, outcome: data ? { ok: true, data } as const : failure(new ReservationError("RESERVATION_EXPIRED")) };
  }

  // A competing insert waits for the first transaction and then sees its committed response.
  const inserted = await tx.$executeRaw`
    INSERT INTO "IdempotencyKey" ("userId", "operation", "key", "requestHash")
    VALUES (${request.userId}::uuid, ${request.operation}, ${request.key}, ${request.requestHash})
    ON CONFLICT ("userId", "operation", "key") DO NOTHING
  `;
  if (!inserted) {
    const outcome = await readOutcome(tx, request);
    if (!outcome) throw new ReservationError("RESERVATION_BUSY");
    return { executed: false, outcome };
  }

  // The savepoint lets a completed failure replay without committing partial business writes.
  await tx.$executeRaw`SAVEPOINT reservation_operation`;
  let outcome: ReservationOutcome;
  try {
    const result = await run();
    if (result) {
      outcome = { ok: true, data: result };
    } else {
      const error = new ReservationError("RESERVATION_EXPIRED");
      outcome = failure(error);
      responseStatus = error.status;
    }
  } catch (error) {
    if (!(error instanceof ReservationError) || retryableErrors.has(error.code)) throw error;
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT reservation_operation`;
    outcome = failure(error);
    responseStatus = error.status;
  }
  await tx.$executeRaw`RELEASE SAVEPOINT reservation_operation`;

  await tx.idempotencyKey.update({
    where: identity(request),
    data: { status: "COMPLETED", responseStatus, responseBody: outcome },
  });
  return { executed: true, outcome };
}
