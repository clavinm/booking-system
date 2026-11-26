import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/database";
import { isLabDatabase } from "@/lib/engineering-env";
import { runEngineeringLab } from "@/services/engineering-lab";

vi.mock("server-only", () => ({}));

describe.runIf(process.env.SEATSYNC_INTEGRATION === "1" && isLabDatabase(process.env.DATABASE_URL))("Isolated engineering examples", () => {
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => { await db().$disconnect(); });

  it("shows the unprotected result only in development and the version check in both modes", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const local = await runEngineeringLab("optimistic");
    expect(local.events.some(({ detail }) => detail.includes("Stock fell to -1"))).toBe(true);
    expect(local.conflicts).toBe(1);

    vi.stubEnv("NODE_ENV", "production");
    const protectedLab = await runEngineeringLab("optimistic");
    expect(protectedLab.events.some(({ request }) => request === "Unprotected writes")).toBe(false);
    expect(protectedLab.conflicts).toBe(1);
  });

  it("holds one seat and leaves no fixture when the race and replay demos finish", async () => {
    for (const [scenario, conflicts] of [["race", 1], ["idempotency", 0]] as const) {
      const existing = await db().workspace.count({ where: { slug: { startsWith: "lab-" } } });
      const result = await runEngineeringLab(scenario);
      expect(result.conflicts).toBe(conflicts);
      expect(result.events.at(-1)?.detail).toContain("1 persisted hold");
      expect(await db().workspace.count({ where: { slug: { startsWith: "lab-" } } })).toBe(existing);
    }
  });
});
