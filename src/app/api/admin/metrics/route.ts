import { reservationFailure, reservationJson } from "@/lib/reservation-http";
import { readAdminMetrics } from "@/repositories/dashboard";
import { getCurrentUser } from "@/services/current-user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return reservationFailure(401, "UNAUTHENTICATED", "Log in to view metrics.");
  if (user.role !== "ADMIN") return reservationFailure(403, "FORBIDDEN", "Administrator access is required.");
  return reservationJson(await readAdminMetrics());
}
