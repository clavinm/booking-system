import "server-only";

import { reservationFailure, reservationJson } from "@/lib/reservation-http";
import { authSettings } from "@/lib/server-env";
import { handleEasebuzzNotification } from "@/services/payments";
import { ReservationError } from "@/services/reservation-error";

export async function easebuzzNotification(request: Request, source: "return" | "webhook") {
  try {
    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/x-www-form-urlencoded" || Number(request.headers.get("content-length")) > 16_384) {
      throw new ReservationError("INVALID_PAYMENT_NOTIFICATION");
    }
    const body = await request.text();
    if (body.length > 16_384) throw new ReservationError("INVALID_PAYMENT_NOTIFICATION");
    const outcome = await handleEasebuzzNotification(new URLSearchParams(body), source);
    if (source === "webhook") {
      if (outcome.status === "PENDING") throw new ReservationError("PAYMENT_UNAVAILABLE");
      return reservationJson({ received: true });
    }
    const url = new URL(`/reservations/${outcome.reservationId}`, authSettings().origin);
    return Response.redirect(url, 303);
  } catch (error) {
    if (!(error instanceof ReservationError)) throw error;
    return reservationFailure(error.status, error.code, error.message);
  }
}
