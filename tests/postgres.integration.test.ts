import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { GET as availability } from "@/app/api/seats/availability/route";
import { GET as getLayout } from "@/app/api/workspaces/[id]/seats/route";
import { GET as getSlots } from "@/app/api/workspaces/[id]/slots/route";
import { workspaceDate } from "@/lib/booking-format";
import type { SeatAvailability } from "@/types/booking";
import { db } from "@/lib/database";
import { authenticateCredentials, registerAccount } from "@/services/accounts";

vi.mock("server-only", () => ({}));

describe.runIf(process.env.SEATSYNC_INTEGRATION === "1")("SeatSync PostgreSQL integration", () => {
  afterAll(() => db().$disconnect());

  it("seeds unique workspaces, seats and half-hour inventory", async () => {
    const [workspaces, seats, categories, slots, inventory, example] = await Promise.all([
      db().workspace.count(),
      db().seat.count(),
      db().seatCategory.count(),
      db().timeSlot.count(),
      db().seatSlot.count(),
      db().timeSlot.findFirstOrThrow(),
    ]);

    expect(workspaces).toBe(8);
    expect(seats).toBe(224);
    expect(categories).toBe(40);
    expect(slots).toBeGreaterThanOrEqual(1393);
    expect(inventory).toBe(slots * 28);
    expect(example.startsAt.getTime() % (30 * 60_000)).toBe(0);
    expect(example.endsAt.getTime() - example.startsAt.getTime()).toBe(30 * 60_000);
  });

  it("rejects a slot starting off the half-hour grid", async () => {
    const { id: workspaceId } = await db().workspace.findFirstOrThrow();
    await expect(db().timeSlot.create({
      data: {
        workspaceId,
        startsAt: new Date("2031-01-01T08:05:00.000Z"),
        endsAt: new Date("2031-01-01T08:35:00.000Z"),
      },
    })).rejects.toThrow("TimeSlot_half_hour_check");
  });

  it("registers once, ignores a submitted admin role and authenticates only the right password", async () => {
    const email = `registration-${randomUUID()}@example.test`;
    const password = "Synthetic test passphrase";
    const input = { name: "Database test", email: email.toUpperCase(), password, role: "ADMIN" };

    try {
      const outcomes = await Promise.all([registerAccount(input), registerAccount(input)]);
      expect(outcomes.filter((outcome) => outcome === null)).toHaveLength(1);

      const user = await db().user.findUniqueOrThrow({ where: { email } });
      expect(user.role).toBe("USER");
      expect(user.passwordHash).toMatch(/^scrypt-v1:/);
      expect(user.passwordHash).not.toContain(password);

      await expect(authenticateCredentials({ email, password })).resolves.toEqual({ id: user.id });
      await expect(authenticateCredentials({ email, password: "incorrect" })).resolves.toBeNull();
    } finally {
      await db().user.deleteMany({ where: { email } });
    }
  });

  it("rejects cross-workspace inventory and a second permanent allocation for the same seat-slot", async () => {
    const pair = await db().seatSlot.findFirstOrThrow();
    const other = await db().seat.findFirstOrThrow({ where: { workspaceId: { not: pair.workspaceId } } });

    await expect(db().seatSlot.create({
      data: { seatId: other.id, timeSlotId: pair.timeSlotId, workspaceId: pair.workspaceId },
    })).rejects.toMatchObject({ code: "P2003" });

    const email = `inventory-${randomUUID()}@example.test`;
    const { workspaceId, seatId, timeSlotId } = pair;
    await expect(db().$transaction(async (transaction) => {
      const { id: userId } = await transaction.user.create({
        data: { name: "Inventory test", email, passwordHash: "unusable-test-placeholder" },
      });
      const data = { workspaceId, userId, totalAmountPaise: 100, expiresAt: new Date(Date.now() + 300_000) };
      const first = await transaction.reservation.create({ data });
      const second = await transaction.reservation.create({ data });
      for (const reservationId of [first.id, second.id]) {
        const { id: reservationItemId } = await transaction.reservationItem.create({
          data: { reservationId, workspaceId, seatId, timeSlotId, seatCode: "S1", unitPricePaise: 100 },
        });
        await transaction.bookingAllocation.create({ data: { seatId, timeSlotId, reservationItemId } });
      }
    })).rejects.toMatchObject({ code: "P2002" });

    await expect(db().user.count({ where: { email } })).resolves.toBe(0);
  });

  it("exposes layouts and upcoming slots and rejects a slot from another workspace", async () => {
    const slug = "the-reading-room";
    const params = { params: Promise.resolve({ id: slug }) };
    const day = workspaceDate("Asia/Kolkata", new Date(Date.now() + 24 * 60 * 60_000));
    const [layoutResponse, slotResponse] = await Promise.all([
      getLayout(new Request(`http://localhost/api/workspaces/${slug}/seats`), params),
      getSlots(new Request(`http://localhost/api/workspaces/${slug}/slots?date=${day}`), params),
    ]);

    expect(layoutResponse.status).toBe(200);
    expect(slotResponse.status).toBe(200);
    expect((await layoutResponse.json()).data.sections).toHaveLength(5);
    const { slots } = (await slotResponse.json()).data;
    expect(slots.length).toBeGreaterThan(0);
    expect(workspaceDate("Asia/Kolkata", new Date(slots[0].startsAt))).toBe(day);
    expect(slots[0].startsAt).toBe(`${day}T01:30:00.000Z`);

    const wrongWorkspace = await availability(new Request(
      `http://localhost/api/seats/availability?workspaceId=studio-north&slotId=${slots[0].id}`,
    ));
    expect(wrongWorkspace.status).toBe(404);

    const knownWorkspaceWithoutSlots = await getSlots(new Request(
      `http://localhost/api/workspaces/${slug}/slots?date=2000-01-01`,
    ), params);
    expect(knownWorkspaceWithoutSlots.status).toBe(200);
    expect((await knownWorkspaceWithoutSlots.json()).data.slots).toEqual([]);
  });

  it("reads free, held, expired, booked and unavailable seats from one PostgreSQL snapshot", async () => {
    const slug = `phase-three-${randomUUID()}`;
    const email = `${slug}@example.test`;
    const halfHour = 30 * 60_000;
    const startsAt = new Date((Math.floor(Date.now() / halfHour) + 3) * halfHour);

    try {
      const fixture = await db().$transaction(async (transaction) => {
        const workspace = await transaction.workspace.create({ data: {
          slug, name: "Availability test space", city: "Mangaluru", neighborhood: "Test",
          address: "Test", kind: "coworking", description: "Test", opensMinute: 0, closesMinute: 1440,
          hourlyPricePaise: 100, ratingTenths: 0, sampleAvailableSeats: 0,
          imageSrc: "/workspaces/common.webp", imageAlt: "Test", amenities: [],
        } });
        const workspaceId = workspace.id;
        const { id: categoryId } = await transaction.seatCategory.create({
          data: { workspaceId, name: "Test seats", displayOrder: 0, slotPricePaise: 50 },
        });
        const slot = await transaction.timeSlot.create({
          data: { workspaceId, startsAt, endsAt: new Date(startsAt.getTime() + halfHour) },
        });
        const seats = await transaction.seat.createManyAndReturn({ data: ["FREE", "HELD", "EXPIRED", "BOOKED", "INACTIVE", "MISSING"].map((code, index) => ({
          workspaceId, categoryId, code, gridRow: 1, gridColumn: index + 1, active: code !== "INACTIVE",
        })) });
        const seatIds = Object.fromEntries(seats.map(({ code, id }) => [code, id]));
        const { id: userId } = await transaction.user.create({
          data: { name: "Availability test", email, passwordHash: "unusable-test-placeholder" },
        });
        const { id: reservationId, expiresAt } = await transaction.reservation.create({
          data: { workspaceId, userId, totalAmountPaise: 100, expiresAt: new Date(Date.now() + halfHour) },
        });

        for (const code of ["FREE", "HELD", "EXPIRED", "BOOKED", "INACTIVE"]) {
          await transaction.seatSlot.create({ data: {
            workspaceId,
            seatId: seatIds[code],
            timeSlotId: slot.id,
            ...(code === "HELD" && { holdReservationId: reservationId, holdExpiresAt: expiresAt }),
            ...(code === "EXPIRED" && { holdReservationId: reservationId, holdExpiresAt: new Date(Date.now() - halfHour) }),
          } });
        }

        const { id: itemId } = await transaction.reservationItem.create({ data: {
          workspaceId, reservationId, seatId: seatIds.BOOKED, timeSlotId: slot.id, seatCode: "BOOKED", unitPricePaise: 50,
        } });
        await transaction.bookingAllocation.create({ data: {
          reservationItemId: itemId, seatId: seatIds.BOOKED, timeSlotId: slot.id,
        } });
        return { slotId: slot.id, seatIds };
      });

      const storedSlot = await db().timeSlot.findUniqueOrThrow({ where: { id: fixture.slotId } });
      expect(storedSlot.startsAt.toISOString()).toBe(startsAt.toISOString());
      const url = `http://localhost/api/seats/availability?workspaceId=${slug}&slotId=${fixture.slotId}`;
      const response = await availability(new Request(url));
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const { data }: { data: SeatAvailability } = await response.json();
      expect(data.checkedAt).toBeTruthy();
      expect(data.seats).toHaveLength(6);
      const bySeat = Object.fromEntries(data.seats.map(({ seatId, state }) => [seatId, state]));
      for (const seat of data.seats) expect(Object.keys(seat).sort()).toEqual(["seatId", "state"]);
      expect(bySeat).toEqual({
        [fixture.seatIds.FREE]: "AVAILABLE",
        [fixture.seatIds.HELD]: "HELD",
        [fixture.seatIds.EXPIRED]: "AVAILABLE",
        [fixture.seatIds.BOOKED]: "BOOKED",
        [fixture.seatIds.INACTIVE]: "UNAVAILABLE",
        [fixture.seatIds.MISSING]: "UNAVAILABLE",
      });

      await db().timeSlot.update({ where: { id: fixture.slotId }, data: { active: false } });
      const { data: closed }: { data: SeatAvailability } = await (await availability(new Request(url))).json();
      expect(closed.seats.every((seat) => seat.state === "UNAVAILABLE")).toBe(true);
    } finally {
      const fixture = await db().workspace.findUnique({ where: { slug }, select: { id: true } });
      if (fixture) {
        const workspaceId = fixture.id;
        await db().$transaction([
          db().bookingAllocation.deleteMany({ where: { reservationItem: { workspaceId } } }),
          db().reservationItem.deleteMany({ where: { workspaceId } }),
          db().seatSlot.deleteMany({ where: { workspaceId } }),
          db().reservation.deleteMany({ where: { workspaceId } }),
          db().user.deleteMany({ where: { email } }),
          db().timeSlot.deleteMany({ where: { workspaceId } }),
          db().seat.deleteMany({ where: { workspaceId } }),
          db().seatCategory.deleteMany({ where: { workspaceId } }),
          db().workspace.delete({ where: { id: workspaceId } }),
        ]);
      }
    }
  });

});
