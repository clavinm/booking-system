import { z } from "zod";
import { slotIdSchema, workspaceSlugSchema } from "@/validations/booking";

export const maximumSeatsPerHold = 50;
export const reservationIdSchema = z.uuid().transform((id) => id.toLowerCase());

export const holdRequestSchema = z.strictObject({
  workspaceId: workspaceSlugSchema,
  slotId: slotIdSchema.transform((id) => id.toLowerCase()),
  seatIds: z.array(z.uuid().transform((id) => id.toLowerCase()))
    .min(1).max(maximumSeatsPerHold)
    .refine((ids) => new Set(ids).size === ids.length, "Choose each seat once."),
});

export type HoldRequest = z.output<typeof holdRequestSchema>;
