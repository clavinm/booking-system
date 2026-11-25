"use server";

import { redirect } from "next/navigation";
import { registerAccount } from "@/services/accounts";
import { getCurrentUser } from "@/services/current-user";

export async function registerAction(_previous: string | null, formData: FormData) {
  if (await getCurrentUser()) redirect("/account");

  const message = await registerAccount({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (message) return message;

  redirect("/account?registered=1");
}
