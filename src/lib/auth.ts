import "server-only";

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authSettings } from "@/lib/server-env";
import { authenticateCredentials } from "@/services/accounts";

export function getAuthOptions(): NextAuthOptions {
  const { secret, origin } = authSettings();
  // Stable Auth.js v4 uses this variable for its canonical origin and callbacks.
  process.env.NEXTAUTH_URL = origin;

  return {
    secret,
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    useSecureCookies: origin.startsWith("https:"),
    pages: { signIn: "/account", error: "/account" },
    providers: [
      CredentialsProvider({
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        authorize: authenticateCredentials,
      }),
    ],
    callbacks: {
      session({ session, token }) {
        if (token.sub) session.user = { id: token.sub };
        return session;
      },
    },
  };
}
