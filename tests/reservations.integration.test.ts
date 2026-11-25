import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseClient, db } from "@/lib/database";
import { cancelReservation, confirmReservation, createHold, getReservation } from "@/services/reservations";
import type { ReservationView } from "@/types/booking";

vi.mock("server-only", () => ({}));

describe.runIf(process.env.SEATSYNC_INTEGRATION === "1")("Concurrent PostgreSQL reservations", () => {
  const workspaceId = "the-reading-room";
  let users: string[] = [];
  let slots: string[] = [];
  let seats: string[] = [];

  beforeAll(async () => {
    const workspace = await db().workspace.findUniqueOrThrow({
      where: { slug: workspaceId },
      select: {
        timeSlots: {
          where: { active: true, startsAt: { gt: new Date(Date.now() + 3_600_000) } },
          orderBy: { startsAt: "asc" }, take: 8, select: { id: true },
        },
      },
    });
    slots = workspace.timeSlots.map(({ id }) => id);
    if (slots.length < 8) throw new Error("Run the seed on a fresh local PostgreSQL database before testing reservations.");

    seats = (await db().seatSlot.findMany({
      where: { timeSlotId: slots[0], seat: { active: true } },
      orderBy: { seatId: "asc" }, take: 4, select: { seatId: true },
    })).map(({ seatId }) => seatId);

    const stamp = randomUUID();
    users = (await db().user.createManyAndReturn({
      data: Array.from({ length: 10 }, (_, index) => ({
        email: `hold-${stamp}-${index}@example.test`, name: "Reservation test",
        passwordHash: "unusable-test-placeholder",
      })),
      select: { id: true },
    })).map(({ id }) => id);
  });

  afterAll(async () => {
    const reservations = await db().reservation.findMany({ where: { userId: { in: users } }, select: { id: true } });
    const ids = reservations.map(({ id }) => id);
    await db().$transaction([
      db().bookingAllocation.deleteMany({ where: { reservationItem: { reservationId: { in: ids } } } }),
      db().seatSlot.updateMany({
        where: { holdReservationId: { in: ids } }, data: { holdReservationId: null, holdExpiresAt: null },
      }),
      db().payment.deleteMany({ where: { reservationId: { in: ids } } }),
      db().reservationItem.deleteMany({ where: { reservationId: { in: ids } } }),
      db().reservation.deleteMany({ where: { id: { in: ids } } }),
      db().user.deleteMany({ where: { id: { in: users } } }),
    ]);
    await db().$disconnect();
  });

  function hold(user: number, slot: number, seatIds: string[]) {
    return createHold(users[user], { workspaceId, slotId: slots[slot], seatIds });
  }

  function recordTestPayment(reservation: ReservationView, amountPaise = reservation.totalAmountPaise) {
    return db().payment.create({
      data: { reservationId: reservation.id, amountPaise, status: "SUCCESS", attemptRef: randomUUID() },
    });
  }

  it("gives exactly one of ten concurrent users the same seat and slot", async () => {
    const calls = await Promise.allSettled(users.map((_, index) => hold(index, 0, [seats[0]])));
    const winners = calls.filter((result) => result.status === "fulfilled");
    const losers = calls.filter((result) => result.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(9);
    expect(losers.every(({ reason }) => reason.code === "SEAT_CONFLICT")).toBe(true);
    expect(await db().reservationItem.count({ where: { seatId: seats[0], timeSlotId: slots[0] } })).toBe(1);
  });

  it("keeps overlapping groups all-or-nothing with different input orders", async () => {
    const calls = await Promise.allSettled([
      hold(0, 1, [seats[1], seats[0]]),
      hold(1, 1, [seats[2], seats[1]]),
    ]);
    const winner = calls.find((result) => result.status === "fulfilled")?.value;
    const loser = calls.find((result) => result.status === "rejected")?.reason;
    expect(winner?.items).toHaveLength(2);
    expect(loser).toMatchObject({ code: "SEAT_CONFLICT", unavailableSeatIds: [seats[1]] });

    const rows = await db().seatSlot.findMany({
      where: { timeSlotId: slots[1], seatId: { in: seats.slice(0, 3) } }, select: { holdReservationId: true },
    });
    expect(rows.filter((row) => row.holdReservationId === winner?.id)).toHaveLength(2);
    expect(rows.filter((row) => row.holdReservationId === null)).toHaveLength(1);
    expect(await db().reservationItem.count({ where: { timeSlotId: slots[1] } })).toBe(2);
  });

  it("lets different time slots independently hold the same seat", async () => {
    const [a, b] = await Promise.all([hold(0, 2, [seats[0]]), hold(1, 3, [seats[0]])]);
    expect(a.status).toBe("HELD");
    expect(b.status).toBe("HELD");
    expect(a.items[0].slot.id).not.toBe(b.items[0].slot.id);
    expect(Date.parse(a.expiresAt) - Date.parse(a.checkedAt)).toBe(300_000);
  });

  it("reclaims an expired hold and protects the new owner during cleanup", async () => {
    const earlier = await hold(0, 4, [seats[0]]);
    await db().$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "Reservation" SET "expiresAt" = clock_timestamp() - interval '1 second',
          "createdAt" = clock_timestamp() - interval '1 minute' WHERE "id" = ${earlier.id}::uuid
      `;
      await tx.$executeRaw`
        UPDATE "SeatSlot" SET "holdExpiresAt" = clock_timestamp() - interval '1 second'
        WHERE "holdReservationId" = ${earlier.id}::uuid
      `;
    });
    expect((await getReservation(earlier.id, users[0])).status).toBe("EXPIRED");
    const later = await hold(1, 4, [seats[0]]);
    await expect(cancelReservation(earlier.id, users[0])).rejects.toMatchObject({ status: 410 });
    expect((await db().reservation.findUniqueOrThrow({ where: { id: earlier.id } })).status).toBe("EXPIRED");
    const inventory = await db().seatSlot.findUniqueOrThrow({ where: {
      seatId_timeSlotId: { seatId: seats[0], timeSlotId: slots[4] },
    } });
    expect(inventory.holdReservationId).toBe(later.id);
  });

  it("checks ownership and payment, confirms a group once, then releases the allocation on cancellation", async () => {
    const reservation = await hold(0, 5, [seats[0], seats[1]]);
    await expect(getReservation(reservation.id, users[1])).rejects.toMatchObject({ status: 404 });
    await expect(confirmReservation(reservation.id, users[1])).rejects.toMatchObject({ status: 404 });
    await expect(cancelReservation(reservation.id, users[1])).rejects.toMatchObject({ status: 404 });
    await expect(confirmReservation(reservation.id, users[0])).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });

    const incorrect = await recordTestPayment(reservation, 1);
    await expect(confirmReservation(reservation.id, users[0])).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
    await db().payment.update({ where: { id: incorrect.id }, data: { amountPaise: reservation.totalAmountPaise } });

    const repeats = await Promise.all([0, 1, 2].map(() => confirmReservation(reservation.id, users[0])));
    expect(repeats.every((result) => result.status === "CONFIRMED" && result.bookingReference)).toBe(true);
    expect(new Set(repeats.map((result) => result.bookingReference)).size).toBe(1);
    expect(await db().bookingAllocation.count({ where: { reservationItem: { reservationId: reservation.id } } })).toBe(2);
    expect(await db().payment.count({ where: { reservationId: reservation.id, status: "SUCCESS" } })).toBe(1);

    const cancelled = await cancelReservation(reservation.id, users[0]);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.bookingReference).toBe(repeats[0].bookingReference);
    expect(cancelled.items).toHaveLength(2);
    expect(await db().bookingAllocation.count({ where: { reservationItem: { reservationId: reservation.id } } })).toBe(0);
    expect((await cancelReservation(reservation.id, users[0])).status).toBe("CANCELLED");
    expect((await hold(1, 5, [seats[0], seats[1]])).status).toBe("HELD");
  });

  it("rejects confirmation when the deadline passes while waiting on a row lock", async () => {
    const reservation = await hold(0, 6, [seats[0]]);
    await recordTestPayment(reservation);
    const blocker = createDatabaseClient();
    const barrier = Promise.withResolvers<void>();

    try {
      const transaction = blocker.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "seatId" FROM "SeatSlot"
          WHERE "holdReservationId" = ${reservation.id}::uuid FOR UPDATE`;
        await tx.$executeRaw`UPDATE "Reservation" SET "expiresAt" = clock_timestamp() + interval '600 milliseconds'
          WHERE "id" = ${reservation.id}::uuid`;
        barrier.resolve();
        await tx.$queryRaw`SELECT pg_sleep(0.8)::text`;
      }).catch((error) => { barrier.reject(error); throw error; });
      await barrier.promise;

      await Promise.all([
        transaction,
        expect(confirmReservation(reservation.id, users[0])).rejects.toMatchObject({ status: 410 }),
      ]);
      expect(await db().bookingAllocation.count({ where: { reservationItem: { reservationId: reservation.id } } })).toBe(0);
      expect((await getReservation(reservation.id, users[0])).status).toBe("EXPIRED");
    } finally {
      await blocker.$disconnect();
    }
  });

  it("retries after a transient lock timeout without creating an extra reservation", async () => {
    const blocker = createDatabaseClient();
    const barrier = Promise.withResolvers<void>();

    try {
      const transaction = blocker.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "seatId" FROM "SeatSlot"
          WHERE "seatId" = ${seats[0]}::uuid AND "timeSlotId" = ${slots[7]}::uuid
          FOR UPDATE`;
        barrier.resolve();
        await tx.$queryRaw`SELECT pg_sleep(1.7)::text`;
      }).catch((error) => { barrier.reject(error); throw error; });
      await barrier.promise;

      const [, reservation] = await Promise.all([transaction, hold(0, 7, [seats[0]])]);
      expect(reservation.status).toBe("HELD");
      expect(await db().reservationItem.count({ where: { seatId: seats[0], timeSlotId: slots[7] } })).toBe(1);
    } finally {
      await blocker.$disconnect();
    }
  });
});
