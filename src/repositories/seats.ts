import "server-only";

import { withCatalogCache } from "@/lib/catalog-cache";
import { db } from "@/lib/database";
import type { BookingSlot, SeatAvailability, SeatLayout, SeatState } from "@/types/booking";

export function getSeatLayout(slug: string): Promise<SeatLayout | null> {
  return withCatalogCache(`seat-layout:${slug}`, 60, () => querySeatLayout(slug));
}

async function querySeatLayout(slug: string): Promise<SeatLayout | null> {
  const row = await db().workspace.findUnique({
    where: { slug, published: true },
    select: {
      slug: true, name: true, city: true, neighborhood: true, timezone: true,
      seatCategories: {
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        select: {
          id: true, name: true, slotPricePaise: true,
          seats: {
            orderBy: [{ gridRow: "asc" }, { gridColumn: "asc" }, { id: "asc" }],
            select: { id: true, code: true, gridRow: true, gridColumn: true },
          },
        },
      },
    },
  });
  if (!row) return null;
  const { slug: id, seatCategories: sections, ...workspace } = row;
  return { workspace: { id, ...workspace }, sections };
}

export async function getUpcomingSlots(slug: string, date: string): Promise<BookingSlot[] | null> {
  const slots = await db().$queryRaw<({ id: string; startsAt: Date; endsAt: Date } | { id: null })[]>`
    SELECT slot."id", slot."startsAt", slot."endsAt"
    FROM "Workspace" AS workspace
    LEFT JOIN "TimeSlot" AS slot ON slot."workspaceId" = workspace."id"
      AND slot."active"
      AND slot."startsAt" > statement_timestamp()
      AND slot."startsAt" >= (${date}::date::timestamp AT TIME ZONE workspace."timezone")
      AND slot."startsAt" < ((${date}::date + 1)::timestamp AT TIME ZONE workspace."timezone")
    WHERE workspace."slug" = ${slug} AND workspace."published"
    ORDER BY slot."startsAt"
  `;

  if (!slots.length) return null;
  return slots.flatMap((slot) => slot.id === null ? [] : [{
    id: slot.id,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
  }]);
}

export async function getSeatAvailability(slug: string, slotId: string): Promise<SeatAvailability | null> {
  const rows = await db().$queryRaw<{ seatId: string | null; state: SeatState; checkedAt: Date }[]>`
    SELECT seat."id" AS "seatId", statement_timestamp() AS "checkedAt",
      CASE
        WHEN NOT slot."active" OR slot."startsAt" <= statement_timestamp()
          OR NOT seat."active" OR inventory."seatId" IS NULL THEN 'UNAVAILABLE'
        WHEN allocation."seatId" IS NOT NULL THEN 'BOOKED'
        WHEN inventory."holdExpiresAt" > statement_timestamp() THEN 'HELD'
        ELSE 'AVAILABLE'
      END AS "state"
    FROM "TimeSlot" AS slot
    JOIN "Workspace" AS workspace ON workspace."id" = slot."workspaceId"
    LEFT JOIN "Seat" AS seat ON seat."workspaceId" = workspace."id"
    LEFT JOIN "SeatSlot" AS inventory
      ON inventory."seatId" = seat."id" AND inventory."timeSlotId" = slot."id"
    LEFT JOIN "BookingAllocation" AS allocation
      ON allocation."seatId" = inventory."seatId" AND allocation."timeSlotId" = inventory."timeSlotId"
    WHERE workspace."slug" = ${slug} AND workspace."published" AND slot."id" = ${slotId}::uuid
  `;

  if (!rows.length) return null;
  return {
    slotId,
    checkedAt: rows[0].checkedAt.toISOString(),
    seats: rows.flatMap(({ seatId, state }) => seatId ? [{ seatId, state }] : []),
  };
}
