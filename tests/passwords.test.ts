import { expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { registrationSchema } from "@/validations/account";

it("normalizes the account email and accepts a long password", () => {
  expect(registrationSchema.parse({
    name: "  SeatSync Learner  ",
    email: " LEARNER@EXAMPLE.TEST ",
    password: "Local test passphrase",
  })).toMatchObject({ name: "SeatSync Learner", email: "learner@example.test" });
});

it("rejects short passwords", () => {
  expect(registrationSchema.safeParse({
    name: "SeatSync Learner", email: "learner@example.test", password: "short",
  }).success).toBe(false);
});

it("salts hashes independently and only accepts the matching password", async () => {
  const password = "A local test passphrase";
  const [first, second] = await Promise.all([hashPassword(password), hashPassword(password)]);
  expect(first).not.toBe(second);
  expect(first).not.toContain(password);

  const results = await Promise.all([
    verifyPassword(password, first),
    verifyPassword("A different passphrase", first),
    verifyPassword(password, undefined),
    verifyPassword(password, "malformed"),
  ]);
  expect(results).toEqual([true, false, false, false]);
});
