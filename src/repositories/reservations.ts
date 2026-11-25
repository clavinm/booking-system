import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ReservationView } from "@/types/booking";

export const reservationFields = {
  id: true,
  workspaceId: true,
  status: true,
  expiresAt: true,
  totalAmountPaise: true,
  bookingReference: true,
  workspace: { select: { slug: true, name: true, city: true, neighborhood: true, timezone: true } },
  items: {
    orderBy: [{ seatId: "asc" }, { timeSlotId: "asc" }],
    select: {
      id: true, seatId: true, timeSlotId: true, seatCode: true, unitPricePaise: true,
      seatSlot: { select: { timeSlot: { select: { id: true, startsAt: true, endsAt: true } } } },
    },
  },
} satisfies Prisma.ReservationSelect;

export type ReservationRecord = Prisma.ReservationGetPayload<{ select: typeof reservationFields }>;

export function readReservation(tx: Prisma.TransactionClient, id: string, userId: string) {
  return tx.reservation.findUnique({ where: { id, userId }, select: reservationFields });
}

export function lockReservationRow(tx: Prisma.TransactionClient, id: string, userId: string) {
  return tx.$queryRaw`
    SELECT "id" FROM "Reservation"
    WHERE "id" = ${id}::uuid AND "userId" = ${userId}::uuid
    FOR UPDATE
  `;
}

export function reservationView(reservation: ReservationRecord, now: Date): ReservationView {
  const { workspace, items, expiresAt, status, id, totalAmountPaise, bookingReference } = reservation;
  const { slug, ...location } = workspace;
  return {
    id,
    status: status === "HELD" && expiresAt <= now ? "EXPIRED" : status,
    expiresAt: expiresAt.toISOString(),
    checkedAt: now.toISOString(),
    totalAmountPaise,
    bookingReference,
    workspace: { id: slug, ...location },
    items: items.map(({ seatCode, unitPricePaise, seatSlot: { timeSlot } }) => ({
      seatCode,
      unitPricePaise,
      slot: { id: timeSlot.id, startsAt: timeSlot.startsAt.toISOString(), endsAt: timeSlot.endsAt.toISOString() },
    })),
  };
}
