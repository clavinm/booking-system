import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database";

const accountFields = { id: true, name: true, email: true, role: true } satisfies Prisma.UserSelect;

export function findAccountById(id: string) {
  return db().user.findUnique({ where: { id }, select: accountFields });
}

export function findCredentials(email: string) {
  return db().user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
}

export async function createAccount(input: { name: string; email: string; passwordHash: string }) {
  try {
    return await db().user.create({ data: input, select: accountFields });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}
