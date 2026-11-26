import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/engineering-lab/route";
import { engineeringLabEnabled, isLabDatabase, isLabOrigin } from "@/lib/engineering-env";
import { getCurrentUser } from "@/services/current-user";
import { runEngineeringLab } from "@/services/engineering-lab";

vi.mock("server-only", () => ({}));
vi.mock("@/services/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/services/engineering-lab", () => ({ runEngineeringLab: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("accepts only dedicated local database names and loopback HTTP origins", () => {
  expect(isLabDatabase("postgresql://u@127.0.0.1/seatsync_lab")).toBe(true);
  expect(isLabDatabase("postgresql://u@127.0.0.1/seatsync")).toBe(false);
  expect(isLabDatabase("postgresql://u@db.example.com/seatsync_lab")).toBe(false);
  expect(isLabDatabase("postgresql://u@lab-db/seatsync_lab", false)).toBe(false);
  expect(isLabOrigin("http://localhost:3001")).toBe(true);
  expect(isLabOrigin("https://example.com")).toBe(false);
  expect(isLabOrigin("http://localhost:3001/extra")).toBe(false);
});

it("keeps the lab hidden by default and prevents regular members from starting an experiment", async () => {
  const request = () => new Request("http://localhost:3001/api/engineering-lab", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: '{"scenario":"race"}',
  });
  vi.stubEnv("SEATSYNC_LAB", "");
  expect((await POST(request())).status).toBe(404);
  vi.stubEnv("SEATSYNC_LAB", "1");
  vi.stubEnv("DATABASE_URL", "postgresql://u@127.0.0.1/seatsync_lab");
  vi.stubEnv("AUTH_URL", "http://localhost:3001");
  expect(engineeringLabEnabled()).toBe(true);
  vi.stubEnv("REDIS_URL", "rediss://cache.example.com:6379");
  expect((await POST(request())).status).toBe(404);
  vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "member", role: "USER", email: "member@example.test", name: "Member" });
  expect((await POST(request())).status).toBe(403);
  expect(runEngineeringLab).not.toHaveBeenCalled();
});
