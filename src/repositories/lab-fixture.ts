import { randomUUID } from "node:crypto";
import { db } from "@/lib/database";

export async function createLabInventory(slotCount: number) {
  const reference = randomUUID().slice(0, 16);
  const workspaceId = `lab-${reference}`;
  const startsAt = new Date((Math.ceil(Date.now() / 1_800_000) + 4) * 1_800_000);

  return db().$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        slug: workspaceId, name: "Concurrency fixture", city: "Mangaluru", kind: "study",
        neighborhood: "Local lab", address: "Disposable inventory", description: "Engineering lab fixture.",
        opensMinute: 0, closesMinute: 1440, hourlyPricePaise: 2_000, ratingTenths: 0, sampleAvailableSeats: 1,
        amenities: [], imageSrc: "/workspaces/reading.webp", imageAlt: "Workspace",
      },
      select: { id: true },
    });
    const category = await tx.seatCategory.create({
      data: { workspaceId: workspace.id, name: "Lab", displayOrder: 0, slotPricePaise: 1_000 },
      select: { id: true },
    });
    const seat = await tx.seat.create({
      data: { workspaceId: workspace.id, categoryId: category.id, code: "L1", gridRow: 1, gridColumn: 1 },
      select: { id: true },
    });
    const slots = await tx.timeSlot.createManyAndReturn({
      data: Array.from({ length: slotCount }, (_, index) => ({
        workspaceId: workspace.id,
        startsAt: new Date(startsAt.getTime() + index * 1_800_000),
        endsAt: new Date(startsAt.getTime() + (index + 1) * 1_800_000),
      })),
      select: { id: true, startsAt: true },
    });
    await tx.seatSlot.createMany({
      data: slots.map(({ id }) => ({ workspaceId: workspace.id, timeSlotId: id, seatId: seat.id })),
    });
    return { id: workspace.id, workspaceId, seatId: seat.id, slots: slots.toSorted((a, b) => +a.startsAt - +b.startsAt) };
  }, { maxWait: 6_000, timeout: 15_000 });
}

export async function removeLabInventory(workspaceId: string, memberIds: string[] = []) {
  const candidate = await db().workspace.findFirst({
    where: { id: workspaceId, slug: { startsWith: "lab-" }, name: "Concurrency fixture" }, select: { id: true },
  });
  if (!candidate) return;
  await db().$transaction(async (tx) => {
    const reservations = { reservation: { workspaceId } };
    await tx.bookingAllocation.deleteMany({ where: { reservationItem: reservations } });
    await tx.auditLog.deleteMany({ where: { actorId: { in: memberIds } } });
    await tx.payment.deleteMany({ where: reservations });
    await tx.seatSlot.updateMany({ where: { workspaceId }, data: { holdReservationId: null, holdExpiresAt: null } });
    await tx.reservationItem.deleteMany({ where: { workspaceId } });
    await tx.reservation.deleteMany({ where: { workspaceId } });
    await tx.seatSlot.deleteMany({ where: { workspaceId } });
    await tx.timeSlot.deleteMany({ where: { workspaceId } });
    await tx.seat.deleteMany({ where: { workspaceId } });
    await tx.seatCategory.deleteMany({ where: { workspaceId } });
    await tx.workspace.delete({ where: { id: workspaceId } });
    await tx.idempotencyKey.deleteMany({ where: { userId: { in: memberIds } } });
    await tx.user.deleteMany({ where: { id: { in: memberIds }, email: { endsWith: "@lab.example.test" } } });
  }, { maxWait: 6_000, timeout: 15_000 });
}
