"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminChangeError, manageInventory } from "@/services/admin";
import { getCurrentUser } from "@/services/current-user";
import { ReservationError } from "@/services/reservation-error";
import { adminChange, bookingQuery } from "@/validations/dashboard";

export async function updateInventory(form: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/account");

  const input = adminChange.safeParse(Object.fromEntries(form));
  if (!input.success) redirect("/admin?error=Review+the+submitted+values.");
  const query = new URLSearchParams({ workspace: input.data.workspaceId, panel: input.data.kind });
  const page = bookingQuery.shape.page.safeParse(form.get("page") ?? undefined).data ?? 1;
  if (page > 1) query.set("page", String(page));
  try {
    await manageInventory(user.id, input.data);
    revalidatePath("/admin");
    if (input.data.kind === "cancel") revalidatePath("/account");
    query.set("saved", "1");
  } catch (error) {
    if (!(error instanceof AdminChangeError || error instanceof ReservationError)) throw error;
    query.set("error", error.message);
  }
  redirect(`/admin?${query}`);
}
