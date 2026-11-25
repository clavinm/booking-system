import { z } from "zod";

export const workspaceSlugSchema = z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const bookingDateSchema = z.iso.date().refine((date) => !date.startsWith("0000-"));
export const slotIdSchema = z.uuid();

const availabilityQuery = z.object({
  workspaceId: workspaceSlugSchema,
  slotId: slotIdSchema,
});

export function parseAvailabilityQuery(search: URLSearchParams) {
  const workspaceIds = search.getAll("workspaceId");
  const slotIds = search.getAll("slotId");

  return availabilityQuery.safeParse({
    workspaceId: workspaceIds.length === 1 ? workspaceIds[0] : undefined,
    slotId: slotIds.length === 1 ? slotIds[0] : undefined,
  });
}
