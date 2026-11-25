import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { appInstanceId } from "@/lib/app-instance";
import { db } from "@/lib/database";
import { easebuzzProvider } from "@/lib/easebuzz";
import { reservationTtlSeconds } from "@/lib/server-env";
import {
  databaseNow, lockInventory, lockSlot, readLockedInventory, releaseHold,
} from "@/repositories/reservation-inventory";
import { lockReservationRow, readReservation, reservationView, type ReservationRecord } from "@/repositories/reservations";
import { findIdempotentOutcome, idempotentReservation, reservationOutcome, type IdempotencyRequest } from "@/services/idempotency";
import { ReservationError } from "@/services/reservation-error";
import { reservationTransaction } from "@/services/reservation-transaction";
import { publishHoldHint, removeHoldHint, withSeatCoordination } from "@/services/seat-coordination";
import type { HoldRequest } from "@/validations/reservation";

async function requireReservation(tx: Prisma.TransactionClient, id: string, userId: string) {
  const reservation = await readReservation(tx, id, userId);
  if (!reservation) throw new ReservationError("RESERVATION_NOT_FOUND");
  return reservation;
}

export async function getReservation(id: string, userId: string) {
  const reservation = await requireReservation(db(), id, userId);
  return reservationView(reservation, await databaseNow(db()));
}

export async function createHold(userId: string, input: HoldRequest, idempotency?: IdempotencyRequest) {
  const prior = await findIdempotentOutcome(idempotency);
  if (prior) return reservationOutcome(prior);

  return withSeatCoordination(input, async (redis) => {
    const result = await reservationTransaction((tx) =>
      idempotentReservation(tx, idempotency, 201, () => createHoldInPostgres(tx, userId, input)),
    );
    const hold = reservationOutcome(result.outcome);
    if (result.executed) await publishHoldHint(redis, hold);
    return hold;
  }, Boolean(idempotency)).catch(async (error: unknown) => {
    if (error instanceof ReservationError && (error.code === "SEAT_CONFLICT" || error.code === "SEAT_COORDINATION_BUSY")) {
      await db().auditLog.create({
        data: { actorId: userId, action: "BOOKING_CONFLICT", entityType: "TimeSlot",
          entityId: input.slotId, reason: error.code, instanceId: appInstanceId() },
      }).catch(() => {});
    }
    throw error;
  });
}

async function createHoldInPostgres(tx: Prisma.TransactionClient, userId: string, input: HoldRequest) {
  const ttlMs = reservationTtlSeconds() * 1_000;

  const slot = await lockSlot(tx, input.slotId, { slug: input.workspaceId });
  if (!slot) throw new ReservationError("SLOT_NOT_FOUND");

  const { workspaceId, id: timeSlotId } = slot;
  await lockInventory(tx, workspaceId, timeSlotId, input.seatIds);
  const rows = await readLockedInventory(tx, workspaceId, timeSlotId, input.seatIds);
  const now = await databaseNow(tx);
  if (!slot.active || slot.startsAt <= now) throw new ReservationError("SLOT_UNAVAILABLE");

  const available = new Set(rows.filter((seat) =>
    seat.active && !seat.booked && (!seat.holdExpiresAt || seat.holdExpiresAt <= now),
  ).map((seat) => seat.seatId));
  const unavailable = input.seatIds.filter((id) => !available.has(id));
  if (unavailable.length) throw new ReservationError("SEAT_CONFLICT", unavailable);

  const expiresAt = new Date(Math.min(now.getTime() + ttlMs, slot.startsAt.getTime()));
  const totalAmountPaise = rows.reduce((total, seat) => total + seat.unitPricePaise, 0);
  const reservation = await tx.reservation.create({
    data: { userId, workspaceId, expiresAt, totalAmountPaise, createdAt: now },
    select: { id: true },
  });

  const claimed = await tx.seatSlot.updateMany({
    where: {
      workspaceId,
      timeSlotId,
      seatId: { in: input.seatIds },
      seat: { active: true },
      allocation: { is: null },
      OR: [{ holdReservationId: null }, { holdExpiresAt: { lte: now } }],
    },
    data: { holdReservationId: reservation.id, holdExpiresAt: expiresAt },
  });
  if (claimed.count !== input.seatIds.length) throw new ReservationError("SEAT_CONFLICT", input.seatIds);

  await tx.reservationItem.createMany({
    data: rows.map(({ seatId, seatCode, unitPricePaise }) => ({
      reservationId: reservation.id, workspaceId, timeSlotId, seatId, seatCode, unitPricePaise,
    })),
  });

  return reservationView(await requireReservation(tx, reservation.id, userId), now);
}

function reservationSeats({ items }: ReservationRecord) {
  const slotId = items[0]?.timeSlotId;
  if (!slotId || items.some((item) => item.timeSlotId !== slotId)) {
    throw new ReservationError("RESERVATION_CLOSED");
  }

  return { slotId, seatIds: items.map(({ seatId }) => seatId) };
}

async function lockReservationInventory(tx: Prisma.TransactionClient, id: string, userId: string) {
  const initial = await requireReservation(tx, id, userId);
  const { workspaceId } = initial;
  const { slotId, seatIds } = reservationSeats(initial);
  const slot = await lockSlot(tx, slotId, { id: workspaceId });
  if (!slot) throw new ReservationError("RESERVATION_CLOSED");
  await lockInventory(tx, workspaceId, slotId, seatIds);
  await lockReservationRow(tx, id, userId);
  return { slot, seatIds, reservation: await requireReservation(tx, id, userId) };
}

async function expireHold(tx: Prisma.TransactionClient, reservation: ReservationRecord, now: Date) {
  await tx.reservation.updateMany({
    where: { id: reservation.id, status: "HELD", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  await releaseHold(tx, reservation.id, reservation.items);
  return null;
}

function withReservationCoordination<T>(
  id: string,
  userId: string,
  run: Parameters<typeof withSeatCoordination<T>>[1],
  useDatabaseOnContention = false,
) {
  return withSeatCoordination(async () => {
    const reservation = await requireReservation(db(), id, userId);
    return { workspaceId: reservation.workspace.slug, ...reservationSeats(reservation) };
  }, run, useDatabaseOnContention);
}

export function cancelReservation(id: string, userId: string, adminId?: string) {
  return withReservationCoordination(id, userId, async (redis) => {
    const result = await reservationTransaction(async (tx) => {
      const { reservation, slot } = await lockReservationInventory(tx, id, userId);
      const now = await databaseNow(tx);

      if (reservation.status === "CANCELLED") return reservationView(reservation, now);
      if (reservation.status === "EXPIRED") return null;
      if (reservation.status === "HELD" && reservation.expiresAt <= now) return expireHold(tx, reservation, now);
      if (slot.startsAt <= now) throw new ReservationError("RESERVATION_CLOSED");

      const cancelled = await tx.reservation.updateMany({
        where: { id, userId, status: reservation.status },
        data: { status: "CANCELLED", cancelledAt: now },
      });
      if (cancelled.count !== 1) throw new ReservationError("RESERVATION_CLOSED");

      if (reservation.status === "CONFIRMED") {
        await tx.bookingAllocation.deleteMany({ where: { reservationItem: { reservationId: id } } });
      }
      await releaseHold(tx, id, reservation.items);
      if (adminId) {
        await tx.auditLog.create({
          data: { actorId: adminId, action: "ADMIN_CANCEL_RESERVATION", entityType: "Reservation", entityId: id },
        });
      }
      return reservationView(await requireReservation(tx, id, userId), now);
    });
    await removeHoldHint(redis, id);
    if (!result) throw new ReservationError("RESERVATION_EXPIRED");
    return result;
  });
}

export type VerifiedCapture = { attemptRef: string; providerPaymentId: string };
const seatUnavailableAfterCapture = new Set(["RESERVATION_CLOSED", "SLOT_UNAVAILABLE", "SEAT_CONFLICT"]);

export async function confirmReservation(
  id: string,
  userId: string,
  idempotency?: IdempotencyRequest,
  capture?: VerifiedCapture,
) {
  const replay = await findIdempotentOutcome(idempotency);
  if (replay) return reservationOutcome(replay);

  return withReservationCoordination(id, userId, async (redis) => {
    const result = await reservationTransaction((tx) =>
      idempotentReservation(tx, idempotency, 200, async () => {
        const inventory = await lockReservationInventory(tx, id, userId);
        if (capture) await recordEasebuzzCapture(tx, inventory.reservation, capture);

        try {
          return await confirmInPostgres(tx, id, userId, inventory);
        } catch (error) {
          // Record a late sandbox capture even if the slot cannot be booked anymore.
          if (capture && error instanceof ReservationError && seatUnavailableAfterCapture.has(error.code)) {
            return reservationView(inventory.reservation, await databaseNow(tx));
          }
          throw error;
        }
      }),
    );
    if (result.executed && (result.outcome.ok ? result.outcome.data.status !== "HELD" : result.outcome.error.code === "RESERVATION_EXPIRED")) {
      await removeHoldHint(redis, id);
    }
    return reservationOutcome(result.outcome);
  }, Boolean(idempotency || capture));
}

async function recordEasebuzzCapture(tx: Prisma.TransactionClient, reservation: ReservationRecord, capture: VerifiedCapture) {
  const payment = await tx.payment.findUnique({
    where: { attemptRef: capture.attemptRef },
    select: { id: true, provider: true, reservationId: true, status: true, amountPaise: true, providerPaymentId: true },
  });
  if (!payment || payment.provider !== easebuzzProvider || payment.reservationId !== reservation.id ||
      payment.amountPaise !== reservation.totalAmountPaise ||
      (payment.providerPaymentId && payment.providerPaymentId !== capture.providerPaymentId)) {
    throw new ReservationError("PAYMENT_MISMATCH");
  }
  if (payment.status === "SUCCESS") return;
  if (payment.status === "REFUNDED") throw new ReservationError("PAYMENT_MISMATCH");
  const other = await tx.payment.findFirst({
    where: { reservationId: reservation.id, status: "SUCCESS" },
    select: { id: true },
  });
  if (other) throw new ReservationError("PAYMENT_MISMATCH");
  await tx.payment.update({
    where: { id: payment.id },
    data: { status: "SUCCESS", providerPaymentId: capture.providerPaymentId },
  });
}

async function confirmInPostgres(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  { reservation, slot, seatIds }: Awaited<ReturnType<typeof lockReservationInventory>>,
) {
  const rows = reservation.status === "HELD"
    ? await readLockedInventory(tx, slot.workspaceId, slot.id, seatIds)
    : [];
  const now = await databaseNow(tx);

  if (reservation.status === "CONFIRMED") return reservationView(reservation, now);
  if (reservation.status === "EXPIRED") return null;
  if (reservation.status !== "HELD") throw new ReservationError("RESERVATION_CLOSED");
  if (reservation.expiresAt <= now) return expireHold(tx, reservation, now);
  if (!slot.active || !slot.published || slot.startsAt <= now) throw new ReservationError("SLOT_UNAVAILABLE");

  const owned = new Set(rows.filter((seat) =>
    seat.active && !seat.booked && seat.holdReservationId === id &&
    seat.holdExpiresAt?.getTime() === reservation.expiresAt.getTime(),
  ).map((seat) => seat.seatId));
  const unavailable = seatIds.filter((seatId) => !owned.has(seatId));
  if (unavailable.length) throw new ReservationError("SEAT_CONFLICT", unavailable);

  const [payment] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Payment"
    WHERE "reservationId" = ${id}::uuid AND "status" = 'SUCCESS'
      AND "amountPaise" = ${reservation.totalAmountPaise}
    FOR SHARE
  `;
  if (!payment) throw new ReservationError("PAYMENT_REQUIRED");

  const bookingReference = `SS-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  const [confirmed] = await tx.$queryRaw<{ confirmedAt: Date }[]>`
    WITH moment AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS "now")
    UPDATE "Reservation" AS reservation
    SET "status" = 'CONFIRMED', "confirmedAt" = moment."now",
      "updatedAt" = moment."now", "bookingReference" = ${bookingReference}
    FROM moment
    WHERE reservation."id" = ${id}::uuid AND reservation."userId" = ${userId}::uuid
      AND reservation."status" = 'HELD' AND reservation."expiresAt" > moment."now"
    RETURNING reservation."confirmedAt"
  `;
  if (!confirmed) return expireHold(tx, reservation, await databaseNow(tx));

  await tx.bookingAllocation.createMany({
    data: reservation.items.map(({ id: reservationItemId, seatId, timeSlotId }) => ({
      reservationItemId, seatId, timeSlotId,
    })),
  });
  await releaseHold(tx, id, reservation.items);
  return reservationView(await requireReservation(tx, id, userId), confirmed.confirmedAt);
}
