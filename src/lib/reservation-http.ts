import "server-only";

import { appInstanceId } from "@/lib/app-instance";
import { authSettings } from "@/lib/server-env";
import { getCurrentUser } from "@/services/current-user";
import { ReservationError } from "@/services/reservation-error";
import { reservationRetryAfter } from "@/services/reservation-rate-limit";
import { reservationIdSchema } from "@/validations/reservation";
import type { ReservationView } from "@/types/booking";

function reservationHeaders() {
  return { "Cache-Control": "private, no-store", "X-SeatSync-Instance": appInstanceId() };
}

export function reservationJson(data: unknown, status = 200) {
  return Response.json({ ok: true, data }, { status, headers: reservationHeaders() });
}

export function reservationFailure(status: number, code: string, message: string, unavailableSeatIds?: string[]) {
  return Response.json({
    ok: false,
    error: { code, message, ...(unavailableSeatIds && { unavailableSeatIds }) },
  }, { status, headers: reservationHeaders() });
}

export async function withReservationUser(
  request: Request,
  handle: (userId: string) => Promise<Response>,
) {
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin !== authSettings().origin) {
      return reservationFailure(403, "INVALID_ORIGIN", "Submit reservation changes from SeatSync.");
    }
    const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      return reservationFailure(400, "INVALID_CONTENT_TYPE", "Send reservation changes as JSON.");
    }
  }

  try {
    const user = await getCurrentUser();
    if (!user) return reservationFailure(401, "UNAUTHENTICATED", "Log in to manage reservations.");
    if (request.method === "POST") {
      const wait = await reservationRetryAfter(user.id);
      if (wait) {
        const response = reservationFailure(429, "RESERVATION_RATE_LIMIT", "Too many reservation updates. Wait a moment and try again.");
        response.headers.set("Retry-After", String(wait));
        return response;
      }
    }
    return await handle(user.id);
  } catch (error) {
    if (!(error instanceof ReservationError)) throw error;
    return reservationFailure(error.status, error.code, error.message, error.unavailableSeatIds);
  }
}

export function reservationById(
  request: Request,
  id: string,
  action: (id: string, userId: string) => Promise<ReservationView>,
) {
  return withReservationUser(request, async (userId) => {
    const parsed = reservationIdSchema.safeParse(id);
    if (!parsed.success) return reservationFailure(400, "INVALID_RESERVATION_ID", "Enter a valid reservation ID.");
    return reservationJson(await action(parsed.data, userId));
  });
}
