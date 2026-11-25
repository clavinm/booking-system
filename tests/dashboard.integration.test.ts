import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as metrics } from "@/app/api/admin/metrics/route";
import { GET as bookings } from "@/app/api/bookings/me/route";
import { db } from "@/lib/database";
import { manageInventory } from "@/services/admin";
import { getCurrentUser } from "@/services/current-user";
import { createHold } from "@/services/reservations";

vi.mock("server-only", () => ({}));
vi.mock("@/services/current-user", () => ({ getCurrentUser: vi.fn() }));

describe.runIf(process.env.SEATSYNC_INTEGRATION === "1")("Dashboard access and inventory", () => {
  const url = "http://localhost:3000/api/bookings/me";
  const slug = "the-reading-room";
  let members: { id: string; email: string; name: string; role: "USER" | "ADMIN" }[];
  let workspaceId: string;
  let slot: { id: string; version: number };
  let seat: { id: string; version: number; gridRow: number; gridColumn: number };
  let reservationId: string;

  beforeAll(async () => {
    members = await db().user.createManyAndReturn({
      data: (["USER", "USER", "ADMIN"] as const).map((role) => ({
        role, name: "Dashboard fixture", email: `dashboard-${randomUUID()}@example.test`, passwordHash: "unused",
      })),
      select: { id: true, name: true, email: true, role: true },
    });
    const workspace = await db().workspace.findUniqueOrThrow({
      where: { slug },
      select: { id: true, timeSlots: {
        where: { startsAt: { gt: new Date(Date.now() + 3_600_000) } },
        orderBy: { startsAt: "desc" }, take: 1,
        select: { id: true, version: true, seats: { orderBy: { seatId: "desc" }, take: 1, select: {
          seat: { select: { id: true, version: true, gridRow: true, gridColumn: true } },
        } } },
      } },
    });
    workspaceId = workspace.id;
    [slot] = workspace.timeSlots;
    seat = workspace.timeSlots[0].seats[0].seat;
    const hold = await createHold(members[0].id, { workspaceId: slug, slotId: slot.id, seatIds: [seat.id] });
    reservationId = hold.id;
  });

  afterAll(async () => {
    if (!members) return;
    const userIds = members.map(({ id }) => id);
    await db().$transaction([
      db().auditLog.deleteMany({ where: { actorId: { in: userIds } } }),
      db().seatSlot.updateMany({ where: { holdReservationId: reservationId ?? randomUUID() }, data: { holdReservationId: null, holdExpiresAt: null } }),
      db().reservationItem.deleteMany({ where: { reservationId: reservationId ?? randomUUID() } }),
      db().reservation.deleteMany({ where: { id: reservationId ?? randomUUID() } }),
      db().user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    await db().$disconnect();
  });

  it("returns only the caller's reservations and restricts metrics to admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await bookings(new Request(url))).status).toBe(401);
    expect((await metrics()).status).toBe(401);

    vi.mocked(getCurrentUser).mockResolvedValue(members[1]);
    expect((await (await bookings(new Request(url))).json()).data.bookings).toEqual([]);
    expect((await metrics()).status).toBe(403);

    vi.mocked(getCurrentUser).mockResolvedValue(members[0]);
    const owned = await bookings(new Request(url));
    expect(owned.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await owned.json()).data.bookings.map(({ id }: { id: string }) => id)).toEqual([reservationId]);
    expect((await bookings(new Request(`${url}?view=invalid`))).status).toBe(400);

    vi.mocked(getCurrentUser).mockResolvedValue(members[2]);
    const result = await metrics();
    expect(result.status).toBe(200);
    expect((await result.json()).data).toMatchObject({
      total: expect.any(Number), held: expect.any(Number), offeredSlots: expect.any(Number), capturedPaise: expect.any(String),
    });
  });

  it("protects active holds from inventory changes and records admin cancellations", async () => {
    const [owner, other, admin] = members;
    await expect(createHold(other.id, { workspaceId: slug, slotId: slot.id, seatIds: [seat.id] }))
      .rejects.toMatchObject({ code: "SEAT_CONFLICT" });
    expect(await db().auditLog.count({ where: { actorId: other.id, action: "BOOKING_CONFLICT" } })).toBe(1);
    await expect(manageInventory(admin.id, { kind: "slot", workspaceId, id: slot.id, version: slot.version, active: false }))
      .rejects.toThrow("active hold or booking");
    await expect(manageInventory(admin.id, { kind: "seat", workspaceId, id: seat.id, version: seat.version,
      row: seat.gridRow, column: seat.gridColumn, active: false })).rejects.toThrow("active hold or booking");

    await manageInventory(admin.id, { kind: "cancel", workspaceId, id: reservationId });
    expect(await db().auditLog.count({ where: { actorId: admin.id, action: "ADMIN_CANCEL_RESERVATION", entityId: reservationId } })).toBe(1);
    vi.mocked(getCurrentUser).mockResolvedValue(owner);
    expect((await (await bookings(new Request(url))).json()).data.bookings).toEqual([]);
    const cancelled = await (await bookings(new Request(`${url}?view=cancelled`))).json();
    expect(cancelled.data.bookings[0]).toMatchObject({ id: reservationId, status: "CANCELLED" });
  });
});
