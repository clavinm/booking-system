import "server-only";

import { Prisma } from "@/generated/prisma/client";

type LockedSlot = {
  id: string;
  workspaceId: string;
  active: boolean;
  published: boolean;
  startsAt: Date;
};

export async function lockSlot(
  tx: Prisma.TransactionClient,
  slotId: string,
  workspace: { slug: string } | { id: string },
) {
  const match = "slug" in workspace
    ? Prisma.sql`workspace."slug" = ${workspace.slug} AND workspace."published"`
    : Prisma.sql`workspace."id" = ${workspace.id}::uuid`;
  const [slot] = await tx.$queryRaw<LockedSlot[]>`
    SELECT slot."id", slot."workspaceId", slot."active", slot."startsAt", workspace."published"
    FROM "TimeSlot" AS slot JOIN "Workspace" AS workspace ON workspace."id" = slot."workspaceId"
    WHERE slot."id" = ${slotId}::uuid AND ${match}
    FOR SHARE OF workspace, slot
  `;
  return slot;
}

export async function lockInventory(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  slotId: string,
  seatIds: string[],
) {
  const requestedSeats = Prisma.join(seatIds.map((id) => Prisma.sql`${id}::uuid`));
  await tx.$queryRaw`
    SELECT inventory."seatId"
    FROM "SeatSlot" AS inventory
    WHERE inventory."workspaceId" = ${workspaceId}::uuid
      AND inventory."timeSlotId" = ${slotId}::uuid
      AND inventory."seatId" IN (${requestedSeats})
    ORDER BY inventory."seatId"
    FOR UPDATE OF inventory
  `;
}

type InventoryState = {
  seatId: string;
  seatCode: string;
  active: boolean;
  unitPricePaise: number;
  booked: boolean;
  holdReservationId: string | null;
  holdExpiresAt: Date | null;
};

export function readLockedInventory(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  slotId: string,
  seatIds: string[],
) {
  const requestedSeats = Prisma.join(seatIds.map((id) => Prisma.sql`${id}::uuid`));
  // This statement starts after the locks are acquired, so allocations committed during a lock wait are visible.
  return tx.$queryRaw<InventoryState[]>`
    SELECT inventory."seatId", seat."code" AS "seatCode", seat."active",
      category."slotPricePaise" AS "unitPricePaise",
      (allocation."seatId" IS NOT NULL) AS "booked",
      inventory."holdReservationId", inventory."holdExpiresAt"
    FROM "SeatSlot" AS inventory
    JOIN "Seat" AS seat ON seat."id" = inventory."seatId"
    JOIN "SeatCategory" AS category ON category."id" = seat."categoryId"
    LEFT JOIN "BookingAllocation" AS allocation
      ON allocation."seatId" = inventory."seatId" AND allocation."timeSlotId" = inventory."timeSlotId"
    WHERE inventory."workspaceId" = ${workspaceId}::uuid
      AND inventory."timeSlotId" = ${slotId}::uuid
      AND inventory."seatId" IN (${requestedSeats})
    ORDER BY inventory."seatId"
    FOR SHARE OF seat, category
  `;
}

export async function databaseNow(tx: Prisma.TransactionClient) {
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"
  `;
  return clock.now;
}

export function releaseHold(
  tx: Prisma.TransactionClient,
  reservationId: string,
  items: { seatId: string; timeSlotId: string }[],
) {
  return tx.seatSlot.updateMany({
    where: { holdReservationId: reservationId, OR: items.map(({ seatId, timeSlotId }) => ({ seatId, timeSlotId })) },
    data: { holdReservationId: null, holdExpiresAt: null },
  });
}
