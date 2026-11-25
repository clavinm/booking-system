import { z } from "zod";

export const bookingQuery = z.object({
  view: z.enum(["upcoming", "completed", "cancelled", "expired"]).default("upcoming"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

const workspaceId = z.uuid();
const coordinates = z.coerce.number().int().min(1).max(100);
const version = z.coerce.number().int().min(0);
const enabled = z.enum(["true", "false"]).transform((value) => value === "true");

export const adminChange = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace"), workspaceId, name: z.string().trim().min(1).max(100), published: enabled }),
  z.object({ kind: z.literal("seat"), workspaceId, id: z.uuid(), version, row: coordinates, column: coordinates, active: enabled }),
  z.object({ kind: z.literal("slot"), workspaceId, id: z.uuid(), version, active: enabled }),
  z.object({ kind: z.literal("add-slot"), workspaceId,
    start: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:(00|30)$/) }),
  z.object({ kind: z.literal("cancel"), workspaceId, id: z.uuid() }),
]);
