import "server-only";

import { getServerSession } from "next-auth";
import { connection } from "next/server";
import { cache } from "react";
import { getAuthOptions } from "@/lib/auth";
import { findAccountById } from "@/repositories/accounts";

export const getCurrentUser = cache(async () => {
  await connection();
  const session = await getServerSession(getAuthOptions());
  return session?.user?.id ? findAccountById(session.user.id) : null;
});
