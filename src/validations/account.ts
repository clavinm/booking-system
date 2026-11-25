import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(80),
  password: z.string().min(15).max(128),
});
