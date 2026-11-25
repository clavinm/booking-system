import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/database";
import {
  authenticateEasebuzzNotification, easebuzzCheckoutUrl, easebuzzProvider, initiateEasebuzzPayment, verifyEasebuzzPayment,
} from "@/lib/easebuzz";
import { databaseNow } from "@/repositories/reservation-inventory";
import { lockReservationRow, readReservation } from "@/repositories/reservations";
import { findIdempotentOutcome, reservationOutcome, type IdempotencyRequest } from "@/services/idempotency";
import { ReservationError } from "@/services/reservation-error";
import { reservationTransaction } from "@/services/reservation-transaction";
import { confirmReservation } from "@/services/reservations";

const checkoutClaimMs = 20_000;
const paymentFields = {
  provider: true, attemptRef: true, amountPaise: true, reservationId: true, status: true,
  reservation: { select: { userId: true } },
} as const;

function latestPayment(reservationId: string, userId: string) {
  return db().payment.findFirst({
    where: { reservationId, provider: easebuzzProvider, reservation: { userId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: paymentFields,
  });
}

export async function getCheckoutPaymentStatus(id: string, userId: string) {
  // A successful payment takes precedence, including historical payment records.
  const captured = await db().payment.findFirst({
    where: { reservationId: id, reservation: { userId }, status: "SUCCESS" },
    select: { id: true },
  });
  return captured ? "SUCCESS" : (await latestPayment(id, userId))?.status ?? null;
}

async function claimCheckout(id: string, userId: string) {
  return reservationTransaction(async (tx) => {
    await lockReservationRow(tx, id, userId);
    const reservation = await readReservation(tx, id, userId);
    if (!reservation) throw new ReservationError("RESERVATION_NOT_FOUND");
    const now = await databaseNow(tx);
    if (reservation.status === "EXPIRED" || (reservation.status === "HELD" && reservation.expiresAt <= now)) {
      throw new ReservationError("RESERVATION_EXPIRED");
    }
    if (reservation.status !== "HELD") throw new ReservationError("RESERVATION_CLOSED");

    const captured = await tx.payment.findFirst({
      where: { reservationId: id, status: "SUCCESS" }, select: { id: true },
    });
    if (captured) throw new ReservationError("PAYMENT_ALREADY_CAPTURED");

    const existing = await tx.payment.findFirst({
      where: { reservationId: id, status: "PENDING", provider: easebuzzProvider },
      select: { id: true, checkoutClaimedAt: true, checkoutAccessKey: true },
    });
    if (existing?.checkoutAccessKey) return { kind: "ready", accessKey: existing.checkoutAccessKey } as const;
    if (existing?.checkoutClaimedAt && now.getTime() - existing.checkoutClaimedAt.getTime() < checkoutClaimMs) {
      throw new ReservationError("CHECKOUT_BUSY");
    }
    const select = { id: true, attemptRef: true, amountPaise: true } as const;
    const payment = existing
      ? await tx.payment.update({ where: { id: existing.id }, data: { checkoutClaimedAt: now }, select })
      : await tx.payment.create({
        data: {
          reservationId: id, attemptRef: randomBytes(10).toString("hex"),
          amountPaise: reservation.totalAmountPaise, provider: easebuzzProvider, checkoutClaimedAt: now,
        },
        select,
      });
    return { kind: "claimed", payment, claimedAt: now } as const;
  });
}

export async function startEasebuzzCheckout(id: string, userId: string, origin: string) {
  const claim = await claimCheckout(id, userId);
  if (claim.kind === "ready") return easebuzzCheckoutUrl(claim.accessKey);

  const { payment, claimedAt } = claim;
  const ownedClaim = { id: payment.id, checkoutClaimedAt: claimedAt, status: "PENDING" } as const;
  try {
    // Keep the gateway request outside the database transaction.
    const accessKey = await initiateEasebuzzPayment(payment.attemptRef, payment.amountPaise, origin);
    const saved = await db().payment.updateMany({
      where: ownedClaim,
      data: { checkoutAccessKey: accessKey, checkoutClaimedAt: null },
    });
    if (saved.count !== 1) throw new ReservationError("CHECKOUT_BUSY");
    return easebuzzCheckoutUrl(accessKey);
  } catch (error) {
    await db().payment.updateMany({ where: ownedClaim, data: { checkoutClaimedAt: null } }).catch(() => {});
    throw error;
  }
}

type CheckoutPayment = NonNullable<Awaited<ReturnType<typeof latestPayment>>>;

function verifyPayment(payment: CheckoutPayment) {
  return payment.status === "PENDING"
    ? verifyEasebuzzPayment(payment.attemptRef, payment.amountPaise)
    : Promise.resolve({ status: payment.status });
}

export async function confirmPaidReservation(id: string, userId: string, idempotency?: IdempotencyRequest) {
  const replay = await findIdempotentOutcome(idempotency);
  if (replay) return reservationOutcome(replay);

  if (await getCheckoutPaymentStatus(id, userId) === "SUCCESS") return confirmReservation(id, userId, idempotency);
  const payment = await latestPayment(id, userId);
  if (!payment) return confirmReservation(id, userId, idempotency);

  const result = await verifyPayment(payment);
  if (result.status === "PENDING") throw new ReservationError("PAYMENT_REQUIRED");
  if (result.status === "FAILED" || result.status === "REFUNDED") throw new ReservationError("PAYMENT_DECLINED");
  return confirmReservation(id, userId, idempotency, "providerPaymentId" in result
    ? { attemptRef: payment.attemptRef, providerPaymentId: result.providerPaymentId }
    : undefined);
}

export async function handleEasebuzzNotification(form: URLSearchParams, source: "return" | "webhook") {
  const { attemptRef, amountPaise } = authenticateEasebuzzNotification(form);
  const payment = await db().payment.findUnique({ where: { attemptRef }, select: paymentFields });
  if (!payment || payment.provider !== easebuzzProvider || payment.amountPaise !== amountPaise) {
    throw new ReservationError("INVALID_PAYMENT_NOTIFICATION");
  }

  try {
    const result = await verifyPayment(payment);
    if (result.status === "SUCCESS") {
      await confirmReservation(payment.reservationId, payment.reservation.userId, undefined, "providerPaymentId" in result
        ? { attemptRef, providerPaymentId: result.providerPaymentId }
        : undefined);
    }
    return { reservationId: payment.reservationId, status: result.status };
  } catch (error) {
    if (!(error instanceof ReservationError)) throw error;
    if (source === "return" && (error.code === "PAYMENT_UNAVAILABLE" || error.code === "RESERVATION_BUSY")) {
      return { reservationId: payment.reservationId, status: "PENDING" } as const;
    }
    if (error.code !== "RESERVATION_EXPIRED" && error.code !== "RESERVATION_CLOSED") throw error;
    return { reservationId: payment.reservationId, status: "SUCCESS" } as const;
  }
}
