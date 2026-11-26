import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { db } from "../../src/lib/database";
import { isLabDatabase } from "../../src/lib/engineering-env";
import { hashPassword } from "../../src/lib/passwords";
import { createLabInventory, removeLabInventory } from "../../src/repositories/lab-fixture";
import { getLabCookie, readHealth } from "./local-auth";

type Summary = {
  seat_accepted: number; seat_conflicts: number; unexpected_outcomes: number;
  requests_instance_a: number; requests_instance_b: number; p95Ms: number;
};
type Winner = { id: string; userId: string; totalAmountPaise: number };

async function runK6(directory: string, fixture: object) {
  const input = join(directory, "input.json");
  const output = join(directory, "output.json");
  await writeFile(input, JSON.stringify(fixture), { mode: 0o600 });
  const status = await new Promise<number | null>((resolve, reject) => {
    const processHandle = spawn(process.env.SEATSYNC_K6_BIN || "k6", ["run", "--quiet", "--no-usage-report", "scripts/load/concurrency.js"], {
      env: {
        NODE_ENV: "production", PATH: process.env.PATH, XDG_CONFIG_HOME: directory,
        SEATSYNC_K6_INPUT: input, SEATSYNC_K6_OUTPUT: output,
      },
      stdio: "inherit",
    });
    processHandle.once("error", reject);
    processHandle.once("exit", resolve);
  });
  const summary: Summary = JSON.parse(await readFile(output, "utf8"));
  assert.equal(status, 0, JSON.stringify(summary));
  return summary;
}

async function benchmark() {
  if (process.env.SEATSYNC_LAB !== "1" || !isLabDatabase(process.env.DATABASE_URL, false)) {
    throw new Error("The benchmark requires SEATSYNC_LAB=1 and a loopback PostgreSQL database named seatsync_lab.");
  }
  const origins = (process.env.SEATSYNC_LAB_ORIGINS || "http://127.0.0.1:3001,http://127.0.0.1:3002").split(",");
  assert.equal(origins.length, 2, "Provide two loopback origins.");
  const targets = await Promise.all(origins.map(readHealth));
  assert.notEqual(targets[0].instance, targets[1].instance, "Use distinct APP_INSTANCE_ID values.");

  const directory = await mkdtemp(join(tmpdir(), "seatsync-k6-"));
  const sizes = [10, 50, 100];
  let fixture: Awaited<ReturnType<typeof createLabInventory>> | undefined;
  let members: { id: string; email: string }[] = [];
  try {
    fixture = await createLabInventory(sizes.length);
    const password = randomUUID();
    const passwordHash = await hashPassword(password);
    members = await db().user.createManyAndReturn({
      data: Array.from({ length: 100 }, (_, index) => ({
        name: `Concurrency user ${index + 1}`, email: `${randomUUID()}@lab.example.test`, passwordHash,
      })),
      select: { id: true, email: true },
    });

    const cookies: string[] = [];
    for (let offset = 0; offset < members.length; offset += 6) {
      const batch = members.slice(offset, offset + 6);
      cookies.push(...await Promise.all(batch.map(({ email }, index) =>
        getLabCookie(targets[(offset + index) % 2].origin, email, password))));
    }
    console.log("Signed in 100 distinct fixture accounts.");
    let winner: Winner | undefined;
    const holds = [];
    for (const [index, size] of sizes.entries()) {
      const selection = { workspaceId: fixture.workspaceId, slotId: fixture.slots[index].id, seatIds: [fixture.seatId] };
      const result = await runK6(directory, { mode: "hold", targets, users: cookies.slice(0, size), selection });
      const persisted: Winner[] = await db().reservation.findMany({
        where: { workspaceId: fixture.id, items: { some: { timeSlotId: selection.slotId } } },
        select: { id: true, userId: true, totalAmountPaise: true },
      });
      assert.equal(persisted.length, 1, "PostgreSQL must store exactly one hold for each contested slot.");
      const inventory: { holdReservationId: string | null } = await db().seatSlot.findUniqueOrThrow({
        where: { seatId_timeSlotId: { seatId: fixture.seatId, timeSlotId: selection.slotId } },
        select: { holdReservationId: true },
      });
      assert.equal(inventory.holdReservationId, persisted[0].id, "The inventory row must refer to the sole winner.");
      winner = persisted[0];
      console.log(JSON.stringify({ users: size, persistedHolds: persisted.length, ...result }));
      holds.push({ users: size, persistedHolds: persisted.length, ...result });
    }
    assert(winner);
    // This fixture records an already-verified capture in the isolated local database.
    // Confirmation still goes through the authenticated SeatSync API on both app instances.
    await db().payment.create({
      data: { reservationId: winner.id, amountPaise: winner.totalAmountPaise, attemptRef: randomUUID(), status: "SUCCESS", provider: "LAB_FIXTURE" },
    });
    const ownerCookie = cookies[members.findIndex(({ id }) => id === winner!.userId)];
    assert(ownerCookie);
    const confirmKey = randomUUID();
    const confirmation = await runK6(directory, {
      mode: "confirm", targets, users: Array.from({ length: 10 }, () => ownerCookie), reservationId: winner.id, confirmKey,
    });
    const [allocations, payments, reservation, replays] = await Promise.all([
      db().bookingAllocation.count({ where: { reservationItem: { reservationId: winner.id } } }),
      db().payment.count({ where: { reservationId: winner.id, status: "SUCCESS" } }),
      db().reservation.findUniqueOrThrow({ where: { id: winner.id }, select: { status: true, bookingReference: true } }),
      db().idempotencyKey.count({ where: { userId: winner.userId, operation: "CONFIRM", key: confirmKey, status: "COMPLETED" } }),
    ]);
    assert.equal(allocations, 1);
    assert.equal(payments, 1);
    assert.equal(reservation.status, "CONFIRMED");
    assert(reservation.bookingReference);
    assert.equal(replays, 1);
    console.log(JSON.stringify({ duplicateConfirmations: 10, allocations, payments, replays, ...confirmation }));
    if (process.env.SEATSYNC_LAB_REPORT) {
      await writeFile(process.env.SEATSYNC_LAB_REPORT, JSON.stringify({ holds, confirmations: { ...confirmation, allocations, payments, replays } }, null, 2));
    }
  } finally {
    try {
      if (fixture) await removeLabInventory(fixture.id, members.map(({ id }) => id));
    } finally {
      await db().$disconnect();
      await rm(directory, { recursive: true, force: true });
    }
  }
}

benchmark().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lab benchmark failed.");
  process.exitCode = 1;
});
