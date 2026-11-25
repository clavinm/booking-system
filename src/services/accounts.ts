import "server-only";

import { hashPassword, verifyPassword } from "@/lib/passwords";
import { createAccount, findCredentials } from "@/repositories/accounts";
import { credentialsSchema, registrationSchema } from "@/validations/account";

export async function registerAccount(input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return "Enter a name, a valid email and a password of 15 to 128 characters.";

  const { name, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  const account = await createAccount({ name, email, passwordHash });
  return account ? null : "Could not create an account. Try signing in or use another email.";
}

export async function authenticateCredentials(input: unknown) {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;
  const account = await findCredentials(email);
  const valid = await verifyPassword(password, account?.passwordHash);
  return valid && account ? { id: account.id } : null;
}
