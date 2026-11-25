import { loadEnvConfig } from "@next/env";
import { createDatabaseClient } from "@/lib/database";
import { emailSchema } from "@/validations/account";

loadEnvConfig(process.cwd());

async function main() {
  const email = emailSchema.safeParse(process.argv[2]);
  if (!email.success) {
    console.error("Usage: npm run db:grant-admin -- <existing account email>");
    process.exitCode = 1;
    return;
  }

  const client = createDatabaseClient();
  try {
    const { count } = await client.user.updateMany({ where: { email: email.data }, data: { role: "ADMIN" } });
    if (count === 0) {
      console.error("No account with that email exists in this database.");
      process.exitCode = 1;
    } else {
      console.log("Granted the administrator role to the selected account.");
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Could not grant admin access.", error);
  process.exitCode = 1;
});
