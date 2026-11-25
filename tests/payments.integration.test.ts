import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as hold } from "@/app/api/reservations/hold/route";
import { POST as checkout } from "@/app/api/payments/checkout/route";
import { POST as browserReturn } from "@/app/api/payments/easebuzz/return/route";
import { POST as webhook } from "@/app/api/payments/easebuzz/webhook/route";
import { POST as confirm } from "@/app/api/reservations/[id]/confirm/route";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database";
import { getCurrentUser } from "@/services/current-user";

vi.mock("server-only", () => ({}));
vi.mock("@/services/current-user", () => ({ getCurrentUser: vi.fn() }));

const origin = "http://localhost:3000";
const key = "fixture-key";
const salt = "fixture-salt";

function request(path: string, body: unknown, idempotencyKey?: string) {
  return new Request(origin + path, {
    method: "POST", headers: { "Content-Type": "application/json", ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }) },
    body: JSON.stringify(body),
  });
}

function notification(fields: Record<string, string>, status = "success", source = "webhook") {
  const hash = createHash("sha512").update(
    [salt, status, ...Array(10).fill(""), fields.email, fields.firstname, fields.productinfo, fields.amount, fields.txnid, key].join("|"),
  ).digest("hex");
  return new Request(origin + `/api/payments/easebuzz/${source}`, {
    method: "POST", body: new URLSearchParams({ ...fields, status, hash }),
  });
}

describe.runIf(process.env.SEATSYNC_INTEGRATION === "1")("Easebuzz checkout and idempotent routes", () => {
  const workspaceId = "the-reading-room";
  let userId: string;
  let slots: string[];
  let seats: string[];

  beforeAll(async () => {
    const user = await db().user.create({
      data: { name: "Payment fixture", email: `payment-${randomUUID()}@example.test`, passwordHash: "test-placeholder" },
    });
    userId = user.id;
    const workspace = await db().workspace.findUniqueOrThrow({
      where: { slug: workspaceId },
      select: { timeSlots: {
        where: { active: true, startsAt: { gt: new Date(Date.now() + 3_600_000) } },
        orderBy: { startsAt: "desc" }, take: 7, select: { id: true },
      } },
    });
    slots = workspace.timeSlots.map(({ id }) => id);
    seats = (await db().seatSlot.findMany({
      where: { timeSlotId: slots[0], seat: { active: true } }, take: 2, orderBy: { seatId: "asc" }, select: { seatId: true },
    })).map(({ seatId }) => seatId);
  });

  beforeEach(() => {
    vi.stubEnv("AUTH_URL", origin);
    vi.stubEnv("AUTH_SECRET", "x".repeat(32));
    vi.stubEnv("EB_MERCHANT_KEY", key);
    vi.stubEnv("EB_SALT", salt);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId, name: "Payment fixture", email: "fixture@example.test", role: "USER" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    if (!userId) return;
    const ids = (await db().reservation.findMany({ where: { userId }, select: { id: true } })).map(({ id }) => id);
    await db().$transaction([
      db().bookingAllocation.deleteMany({ where: { reservationItem: { reservationId: { in: ids } } } }),
      db().seatSlot.updateMany({ where: { holdReservationId: { in: ids } }, data: { holdReservationId: null, holdExpiresAt: null } }),
      db().payment.deleteMany({ where: { reservationId: { in: ids } } }),
      db().idempotencyKey.deleteMany({ where: { userId } }),
      db().reservationItem.deleteMany({ where: { reservationId: { in: ids } } }),
      db().reservation.deleteMany({ where: { id: { in: ids } } }),
      db().user.delete({ where: { id: userId } }),
    ]);
    await db().$disconnect();
  });

  function holdRequest(slot: number, seatIds = seats, idem?: string) {
    return hold(request("/api/reservations/hold", { workspaceId, slotId: slots[slot], seatIds }, idem));
  }

  async function paymentFields(id: string) {
    const payment = await db().payment.findFirstOrThrow({ where: { reservationId: id } });
    return {
      key, txnid: payment.attemptRef, amount: (payment.amountPaise / 100).toFixed(2),
      email: "checkout@example.com", firstname: "SeatSync", productinfo: "SeatSync workspace reservation",
    };
  }

  function mockInitiation() {
    const initiate = vi.fn(async () => Response.json({ status: 1, data: "a".repeat(64) }));
    vi.stubGlobal("fetch", initiate);
    return initiate;
  }

  async function setupPayment(slot: number) {
    const response = await holdRequest(slot);
    expect(response.status).toBe(201);
    const { data: { id } } = await response.json();
    const initiate = mockInitiation();
    const first = await checkout(request("/api/payments/checkout", { reservationId: id }));
    const second = await checkout(request("/api/payments/checkout", { reservationId: id }));
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await second.json()).toEqual(await first.json());
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(await db().payment.count({ where: { reservationId: id } })).toBe(1);
    return { id: id as string, fields: await paymentFields(id) };
  }

  function mockGateway(fields: Record<string, string>, status: "success" | "failure") {
    const providerId = `E${fields.txnid}`;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      status: true, msg: { txnid: fields.txnid, amount: fields.amount, status, easepayid: providerId },
    })));
  }

  function confirmRequest(id: string, idem: string, body: unknown = {}) {
    return confirm(request(`/api/reservations/${id}/confirm`, body, idem), { params: Promise.resolve({ id }) });
  }

  it("replays concurrent holds, normalizes seat order, and rejects key reuse with a different payload", async () => {
    const idem = randomUUID();
    const [a, b] = await Promise.all([holdRequest(0, seats, idem), holdRequest(0, seats.toReversed(), idem)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const created = await a.json();
    expect(await b.json()).toEqual(created);
    expect(await db().reservationItem.count({ where: { reservationId: created.data.id } })).toBe(2);

    const conflict = await holdRequest(1, seats, idem);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("holds the full selection before contacting Easebuzz and reuses checkout on retry", async () => {
    const idem = randomUUID();
    const draft = () => request("/api/payments/checkout", { workspaceId, slotId: slots[6], seatIds: seats }, idem);
    const gatewayStarted = Promise.withResolvers<void>();
    const gatewayReply = Promise.withResolvers<Response>();
    const gateway = vi.fn(() => {
      gatewayStarted.resolve();
      return gatewayReply.promise;
    });
    vi.stubGlobal("fetch", gateway);

    const first = checkout(draft());
    try {
      await gatewayStarted.promise;
      const held = await db().seatSlot.count({ where: {
        timeSlotId: slots[6], seatId: { in: seats }, holdReservation: { userId, status: "HELD" },
      } });
      expect(held).toBe(2);
      expect((await checkout(draft())).status).toBe(503);
    } finally {
      gatewayReply.resolve(Response.json({ status: 1, data: "a".repeat(64) }));
    }
    const initial = await first;
    expect(initial.status).toBe(200);
    const body = await initial.json();
    expect(body.data.checkoutUrl).toBe(`https://testpay.easebuzz.in/pay/${"a".repeat(64)}`);
    const replay = await checkout(draft());
    expect(await replay.json()).toEqual(body);
    expect(gateway).toHaveBeenCalledTimes(1);
  });

  it("converges on a single payment and group booking when confirmation and webhooks race", async () => {
    const { id, fields } = await setupPayment(1);
    const idem = randomUUID();
    expect((await confirmRequest(id, idem, { status: "SUCCESS" })).status).toBe(400);
    mockGateway(fields, "success");

    const [first, second, callbackA, callbackB] = await Promise.all([
      confirmRequest(id, idem), confirmRequest(id, idem),
      webhook(notification(fields)), webhook(notification(fields)),
    ]);
    expect([first.status, second.status, callbackA.status, callbackB.status]).toEqual([200, 200, 200, 200]);
    const result = await first.json();
    expect(await second.json()).toEqual(result);
    expect(result.data.status).toBe("CONFIRMED");
    expect(await db().payment.count({ where: { reservationId: id, status: "SUCCESS" } })).toBe(1);
    expect(await db().bookingAllocation.count({ where: { reservationItem: { reservationId: id } } })).toBe(2);
    expect((await confirmRequest(randomUUID(), idem)).status).toBe(409);
  });

  it("keeps the same checkout after a failed card attempt and can verify a later success", async () => {
    const { id, fields } = await setupPayment(2);
    mockGateway(fields, "failure");

    expect((await browserReturn(notification(fields, "failure", "return"))).status).toBe(303);
    expect((await db().payment.findUniqueOrThrow({ where: { attemptRef: fields.txnid } })).status).toBe("PENDING");
    expect((await confirmRequest(id, randomUUID())).status).toBe(409);
    mockGateway(fields, "success");
    expect((await webhook(notification(fields))).status).toBe(200);
    expect((await db().payment.findUniqueOrThrow({ where: { attemptRef: fields.txnid } })).status).toBe("SUCCESS");
  });

  it("records a late capture without reviving an expired hold", async () => {
    const { id, fields } = await setupPayment(3);
    await db().$executeRaw`UPDATE "Reservation"
      SET "createdAt" = clock_timestamp() - interval '1 minute', "expiresAt" = clock_timestamp() - interval '1 second'
      WHERE id = ${id}::uuid`;
    mockGateway(fields, "success");

    expect((await webhook(notification(fields))).status).toBe(200);
    expect((await db().payment.findUniqueOrThrow({ where: { attemptRef: fields.txnid } })).status).toBe("SUCCESS");
    expect((await db().reservation.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED");
    expect(await db().bookingAllocation.count({ where: { reservationItem: { reservationId: id } } })).toBe(0);
  });

  it("returns the browser to the hold during a Easebuzz outage and leaves confirmation retryable", async () => {
    const { id, fields } = await setupPayment(4);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Test gateway outage")));
    const idem = randomUUID();
    const callback = await browserReturn(notification(fields, "success", "return"));
    expect(callback.status).toBe(303);
    expect(callback.headers.get("Location")).toBe(`${origin}/reservations/${id}`);
    expect((await webhook(notification(fields))).status).toBe(503);
    expect((await confirmRequest(id, idem)).status).toBe(503);

    mockGateway(fields, "success");
    expect((await confirmRequest(id, idem)).status).toBe(200);
  });

  it("retries a transaction start timeout and returns the browser to the hold if confirmation is busy", async () => {
    const { id, fields } = await setupPayment(5);
    mockGateway(fields, "success");
    const transaction = vi.spyOn(db(), "$transaction");
    try {
      const busy = new Prisma.PrismaClientKnownRequestError("Transaction already closed: expired transaction", {
        code: "P2028", clientVersion: "test",
      });
      transaction.mockRejectedValueOnce(busy).mockRejectedValueOnce(busy);
      const callback = await browserReturn(notification(fields, "success", "return"));
      expect(callback.status).toBe(303);
      expect(callback.headers.get("Location")).toBe(`${origin}/reservations/${id}`);
      expect((await webhook(notification(fields))).status).toBe(503);

      transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
        "Transaction API error: Unable to start a transaction in the given time.",
        { code: "P2028", clientVersion: "test" },
      ));
      expect((await confirmRequest(id, randomUUID())).status).toBe(200);
      expect(transaction).toHaveBeenCalledTimes(4);
      expect(await db().payment.count({ where: { reservationId: id, status: "SUCCESS" } })).toBe(1);
    } finally {
      transaction.mockRestore();
    }
  });
});
