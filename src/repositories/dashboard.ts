import "server-only";

import { db } from "@/lib/database";
import type { Prisma } from "@/generated/prisma/client";
import { databaseNow } from "@/repositories/reservation-inventory";
import { reservationFields, reservationView } from "@/repositories/reservations";

export const bookingTabs = ["upcoming", "completed", "cancelled", "expired"] as const;
export type BookingTab = typeof bookingTabs[number];
export const bookingsPageSize = 10;

export async function readUserBookings(userId: string, tab: BookingTab, page: number) {
  const clock = await databaseNow(db());
  const upcoming = { items: { some: { seatSlot: { timeSlot: { endsAt: { gt: clock } } } } } };
  const filters: Record<BookingTab, Prisma.ReservationWhereInput> = {
    upcoming: { OR: [{ status: "HELD", expiresAt: { gt: clock } }, { status: "CONFIRMED", ...upcoming }] },
    completed: { status: "CONFIRMED", NOT: upcoming },
    cancelled: { status: "CANCELLED" },
    expired: { OR: [{ status: "EXPIRED" }, { status: "HELD", expiresAt: { lte: clock } }] },
  };
  const where = { userId, ...filters[tab] };
  const [rows, payments] = await Promise.all([
    db().reservation.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * bookingsPageSize, take: bookingsPageSize + 1, select: reservationFields,
    }),
    db().payment.findMany({
      where: { reservation: { userId } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10,
      select: { id: true, reservationId: true, amountPaise: true, status: true, provider: true, createdAt: true,
        reservation: { select: { workspace: { select: { name: true } } } } },
    }),
  ]);

  return { bookings: rows.slice(0, bookingsPageSize).map((row) => reservationView(row, clock)),
    payments, page, hasNext: rows.length > bookingsPageSize };
}

export async function readAdminMetrics() {
  const [result] = await db().$queryRaw<{
    asOf: Date; total: number; confirmed: number; held: number; expired: number; cancelled: number;
    capturedPaise: string; bookedSlots: number; offeredSlots: number; conflicts: number;
  }[]>`
    WITH moment AS (SELECT clock_timestamp() AS now),
    reservations AS (
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed,
        count(*) FILTER (WHERE status = 'HELD' AND "expiresAt" > moment.now)::int AS held,
        count(*) FILTER (WHERE status = 'EXPIRED' OR (status = 'HELD' AND "expiresAt" <= moment.now))::int AS expired,
        count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
      FROM "Reservation", moment
    ),
    occupancy AS (
      SELECT count(*)::int AS "offeredSlots", count(allocation."seatId")::int AS "bookedSlots"
      FROM "SeatSlot" inventory
      JOIN "Seat" seat ON seat.id = inventory."seatId"
      JOIN "TimeSlot" slot ON slot.id = inventory."timeSlotId"
      JOIN "Workspace" workspace ON workspace.id = inventory."workspaceId"
      LEFT JOIN "BookingAllocation" allocation
        ON allocation."seatId" = inventory."seatId" AND allocation."timeSlotId" = inventory."timeSlotId"
      CROSS JOIN moment
      WHERE workspace.published AND seat.active AND slot.active
        AND slot."startsAt" >= moment.now AND slot."startsAt" < moment.now + interval '7 days'
    )
    SELECT moment.now AS "asOf", reservations.*, occupancy.*,
      (SELECT COALESCE(sum("amountPaise"), 0)::text FROM "Payment"
        WHERE status = 'SUCCESS' AND provider IN ('EASEBUZZ_TEST', 'PAYU_TEST')) AS "capturedPaise",
      (SELECT count(*)::int FROM "AuditLog" WHERE action = 'BOOKING_CONFLICT') AS conflicts
    FROM moment, reservations, occupancy
  `;
  return result;
}

export async function readAdminInventory(workspaceId: string | undefined, page: number) {
  const workspaces = await db().workspace.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, city: true, neighborhood: true, published: true, timezone: true },
  });
  const workspace = workspaces.find(({ id }) => id === workspaceId) ?? workspaces[0];
  if (!workspace) return { workspaces, workspace: null, seats: [], slots: [], reservations: [], moreSlots: false, moreReservations: false };
  const now = await databaseNow(db());
  const [seats, slots, reservations] = await Promise.all([
    db().seat.findMany({
      where: { workspaceId: workspace.id }, orderBy: [{ category: { displayOrder: "asc" } }, { code: "asc" }],
      select: { id: true, code: true, active: true, gridRow: true, gridColumn: true, version: true,
        category: { select: { name: true, id: true } } },
    }),
    db().timeSlot.findMany({
      where: { workspaceId: workspace.id, startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, skip: (page - 1) * 24, take: 25,
      select: { id: true, startsAt: true, endsAt: true, active: true, version: true },
    }),
    db().reservation.findMany({
      where: { workspaceId: workspace.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 15, take: 16,
      select: { ...reservationFields, userId: true, owner: { select: { name: true } } },
    }),
  ]);
  return { workspaces, workspace, seats, slots: slots.slice(0, 24),
    moreSlots: slots.length > 24, moreReservations: reservations.length > 15,
    reservations: reservations.slice(0, 15).map((row) => ({ ...reservationView(row, now), ownerName: row.owner.name })) };
}
