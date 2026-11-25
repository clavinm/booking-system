import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as hold } from "@/app/api/reservations/hold/route";
import { GET as details } from "@/app/api/reservations/[id]/route";
import { POST as confirm } from "@/app/api/reservations/[id]/confirm/route";
import { getCurrentUser } from "@/services/current-user";
import { holdRequestSchema } from "@/validations/reservation";

vi.mock("server-only", () => ({}));
vi.mock("@/services/current-user", () => ({ getCurrentUser: vi.fn() }));

const id = "899d979a-c436-4bd4-a591-1304714eee32";
const otherId = "cf65fdc4-3f6a-41dd-ad35-f5b330441faf";
const input = { workspaceId: "the-reading-room", slotId: id, seatIds: [otherId] };
const origin = "http://localhost:3000";
const context = { params: Promise.resolve({ id }) };

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function holdRequest(body: string, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/reservations/hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("hold validation", () => {
  it("normalizes UUIDs and rejects duplicate or empty selections", () => {
    expect(holdRequestSchema.parse({ ...input, seatIds: [otherId.toUpperCase()] })).toEqual(input);
    expect(holdRequestSchema.safeParse({ ...input, seatIds: [otherId, otherId.toUpperCase()] }).success).toBe(false);
    expect(holdRequestSchema.safeParse({ ...input, seatIds: [] }).success).toBe(false);
  });

  it("accepts identifiers only, so clients cannot submit a price or owner", () => {
    expect(holdRequestSchema.safeParse({ ...input, totalAmountPaise: 1 }).success).toBe(false);
    expect(holdRequestSchema.safeParse({ ...input, userId: id }).success).toBe(false);
  });
});

describe("reservation HTTP boundary", () => {
  it("requires a session to create, read or confirm reservations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const requests = [
      hold(holdRequest(JSON.stringify(input))),
      details(new Request(`${origin}/api/reservations/${id}`), context),
      confirm(new Request(`${origin}/api/reservations/${id}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "SUCCESS" }),
      }), context),
    ];
    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("rejects malformed authenticated requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id, role: "USER", name: "Test", email: "test@example.test" });
    expect((await hold(holdRequest("{"))).status).toBe(400);
    expect((await hold(holdRequest("{}", { "Content-Type": "text/plain" }))).status).toBe(400);
  });

  it("rejects a browser POST from an untrusted origin", async () => {
    vi.stubEnv("AUTH_URL", origin);
    vi.stubEnv("AUTH_SECRET", "p".repeat(32));
    const response = await hold(holdRequest(JSON.stringify(input), { Origin: "https://example.test" }));
    expect(response.status).toBe(403);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
