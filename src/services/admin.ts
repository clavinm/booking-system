import "server-only";

import { invalidateCatalogCache } from "@/lib/catalog-cache";
import { db } from "@/lib/database";
import type { Prisma } from "@/generated/prisma/client";
import { databaseNow } from "@/repositories/reservation-inventory";
import { ReservationError } from "@/services/reservation-error";
import { reservationTransaction } from "@/services/reservation-transaction";
import { cancelReservation } from "@/services/reservations";
import type { z } from "zod";
import type { adminChange } from "@/validations/dashboard";

type Change = z.output<typeof adminChange>;

export class AdminChangeError extends Error {}

async function ensureUnused(tx: Prisma.TransactionClient, filter: Prisma.SeatSlotWhereInput, now: Date) {
  const used = await tx.seatSlot.findFirst({
    where: {
      ...filter, timeSlot: { endsAt: { gt: now } },
      OR: [{ allocation: { isNot: null } }, { holdExpiresAt: { gt: now } }],
    },
    select: { seatId: true },
  });
  if (used) throw new AdminChangeError("This inventory has an active hold or booking.");
}

export async function manageInventory(actorId: string, change: Change) {
  if (change.kind === "cancel") {
    const reservation = await db().reservation.findUnique({
      where: { id: change.id, workspaceId: change.workspaceId },
      select: { userId: true },
    });
    if (!reservation) throw new ReservationError("RESERVATION_NOT_FOUND");
    await cancelReservation(change.id, reservation.userId, actorId);
    return;
  }

  await reservationTransaction(async (tx) => {
    // Booking mutations take a shared lock on this workspace before locking seats.
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${change.workspaceId}::uuid FOR UPDATE`;
    const workspace = await tx.workspace.findUnique({ where: { id: change.workspaceId } });
    if (!workspace) throw new AdminChangeError("That workspace could not be found.");
    const now = await databaseNow(tx);
    let entityId = workspace.id;
    let entityType = "Workspace";

    switch (change.kind) {
      case "workspace": {
        if (workspace.published && !change.published) await ensureUnused(tx, { workspaceId: workspace.id }, now);
        await tx.workspace.update({
          where: { id: workspace.id }, data: { name: change.name, published: change.published },
        });
        break;
      }
      case "seat": {
        const seat = await tx.seat.findUnique({ where: { id: change.id, workspaceId: workspace.id } });
        if (!seat || seat.version !== change.version) throw new AdminChangeError("This seat changed. Reload the dashboard before editing.");
        const duplicate = await tx.seat.findFirst({
          where: { id: { not: seat.id }, categoryId: seat.categoryId, gridRow: change.row, gridColumn: change.column },
          select: { id: true },
        });
        if (duplicate) throw new AdminChangeError("A seat already uses that position in this section.");
        if (seat.active && !change.active) await ensureUnused(tx, { seatId: seat.id }, now);
        await tx.seat.update({
          where: { id: seat.id },
          data: { gridRow: change.row, gridColumn: change.column, active: change.active, version: { increment: 1 } },
        });
        entityId = seat.id;
        entityType = "Seat";
        break;
      }
      case "slot": {
        const slot = await tx.timeSlot.findUnique({ where: { id: change.id, workspaceId: workspace.id } });
        if (!slot || slot.version !== change.version || slot.startsAt <= now) {
          throw new AdminChangeError("This slot has changed or already started. Reload the dashboard.");
        }
        if (slot.active && !change.active) await ensureUnused(tx, { timeSlotId: slot.id }, now);
        await tx.timeSlot.update({
          where: { id: slot.id }, data: { active: change.active, version: { increment: 1 } },
        });
        entityId = slot.id;
        entityType = "TimeSlot";
        break;
      }
      case "add-slot": {
        const startsAt = new Date(`${change.start}:00+05:30`);
        const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
        const [hour, minute] = change.start.slice(11).split(":").map(Number);
        const openingMinute = hour * 60 + minute;
        if (workspace.timezone !== "Asia/Kolkata" || !Number.isFinite(startsAt.getTime()) ||
            new Date(startsAt.getTime() + 330 * 60_000).toISOString().slice(0, 16) !== change.start ||
            startsAt <= now || openingMinute < workspace.opensMinute || openingMinute + 30 > workspace.closesMinute) {
          throw new AdminChangeError("Choose a future 30-minute slot within workspace hours in IST.");
        }
        if (await tx.timeSlot.findFirst({ where: { workspaceId: workspace.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } })) {
          throw new AdminChangeError("An existing slot overlaps that time.");
        }
        const slot = await tx.timeSlot.create({ data: { workspaceId: workspace.id, startsAt, endsAt } });
        const seats = await tx.seat.findMany({ where: { workspaceId: workspace.id }, select: { id: true } });
        await tx.seatSlot.createMany({
          data: seats.map(({ id }) => ({ seatId: id, timeSlotId: slot.id, workspaceId: workspace.id })),
        });
        entityId = slot.id;
        entityType = "TimeSlot";
        break;
      }
    }
    await tx.auditLog.create({ data: { actorId, action: "ADMIN_INVENTORY_UPDATE", entityType, entityId } });
  });

  if (change.kind === "workspace" || change.kind === "seat") await invalidateCatalogCache();
}
