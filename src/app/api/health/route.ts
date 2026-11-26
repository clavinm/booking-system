import { io } from "next/cache";
import { db } from "@/lib/database";
import { reservationFailure, reservationJson } from "@/lib/reservation-http";

export async function GET() {
  await io();
  try {
    await db().$queryRaw`SELECT 1`;
    return reservationJson({ status: "ok" });
  } catch {
    return reservationFailure(503, "DATABASE_UNAVAILABLE", "Database is unavailable.");
  }
}
