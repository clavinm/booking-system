import { expect, it, vi } from "vitest";
import { GET as availability } from "@/app/api/seats/availability/route";
import { GET as slots } from "@/app/api/workspaces/[id]/slots/route";
import { bookingDayLabel, seatPrice, slotLabel, workspaceDate } from "@/lib/booking-format";
import { parseAvailabilityQuery } from "@/validations/booking";

vi.mock("server-only", () => ({}));

const exampleSlotId = "899d979a-c436-4bd4-a591-1304714eee32";

it("accepts the workspace slug and a UUID to look up a slot", () => {
  const result = parseAvailabilityQuery(new URLSearchParams({
    workspaceId: "the-reading-room", slotId: exampleSlotId,
  }));
  expect(result.success).toBe(true);
});

it.each([
  "workspaceId=the-reading-room&slotId=invalid",
  `workspaceId=bad/slug&slotId=${exampleSlotId}`,
  `workspaceId=the-reading-room&slotId=${exampleSlotId}&slotId=${exampleSlotId}`,
])("rejects an invalid or ambiguous availability query before accessing PostgreSQL", async (query) => {
  const response = await availability(new Request(`http://localhost/api/seats/availability?${query}`));
  expect(response.status).toBe(400);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it.each(["2026-02-30", "0000-01-01"])("rejects a date PostgreSQL cannot use: %s", async (date) => {
  const response = await slots(new Request(`http://localhost/api/workspaces/the-reading-room/slots?date=${date}`), {
    params: Promise.resolve({ id: "the-reading-room" }),
  });
  expect(response.status).toBe(400);
});

it("derives the date from the workspace timezone and formats paise", () => {
  const instant = new Date("2026-03-08T19:30:00.000Z");
  expect(workspaceDate("Asia/Kolkata", instant)).toBe("2026-03-09");
  expect(workspaceDate("UTC", instant)).toBe("2026-03-08");
  expect(bookingDayLabel("2026-03-09")).toContain("March");
  expect(seatPrice(3950)).toBe("₹39.5");
});

it("formats local times with consistent spacing and handles noon and midnight", () => {
  const label = (startsAt: string, endsAt: string, timezone = "Asia/Kolkata") =>
    slotLabel({ id: exampleSlotId, startsAt, endsAt }, timezone);
  expect(label("2026-11-25T12:00:00Z", "2026-11-25T12:30:00Z")).toBe("5:30 – 6:00 PM");
  expect(label("2026-11-25T06:00:00Z", "2026-11-25T06:30:00Z")).toBe("11:30 AM – 12:00 PM");
  expect(label("2026-11-25T18:00:00Z", "2026-11-25T18:30:00Z")).toBe("11:30 PM – 12:00 AM");
  expect(label("2026-11-25T12:00:00Z", "2026-11-25T12:30:00Z", "UTC")).toBe("12:00 – 12:30 PM");
});
