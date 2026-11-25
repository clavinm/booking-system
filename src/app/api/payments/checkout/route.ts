import { z } from "zod";
import { easebuzzCredentials } from "@/lib/easebuzz";
import { reservationFailure, reservationJson, withReservationUser } from "@/lib/reservation-http";
import { authSettings } from "@/lib/server-env";
import { idempotencyRequest, readIdempotencyKey } from "@/services/idempotency";
import { startEasebuzzCheckout } from "@/services/payments";
import { createHold } from "@/services/reservations";
import { holdRequestSchema, reservationIdSchema } from "@/validations/reservation";

const checkoutRequest = z.union([z.strictObject({ reservationId: reservationIdSchema }), holdRequestSchema]);

export function POST(request: Request) {
  return withReservationUser(request, async (userId) => {
    const parsed = checkoutRequest.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) return reservationFailure(400, "INVALID_CHECKOUT", "Choose your seats or enter a valid reservation ID.");
    easebuzzCredentials();
    const origin = authSettings().origin;

    let id: string;
    if ("reservationId" in parsed.data) {
      id = parsed.data.reservationId;
    } else {
      const key = readIdempotencyKey(request);
      if (!key) return reservationFailure(400, "INVALID_IDEMPOTENCY_KEY", "Send an Idempotency-Key to start checkout.");
      const input = { ...parsed.data, seatIds: parsed.data.seatIds.toSorted() };
      const hold = await createHold(userId, input, idempotencyRequest(userId, "HOLD", key, input));
      id = hold.id;
    }

    return reservationJson({ checkoutUrl: await startEasebuzzCheckout(id, userId, origin) });
  });
}
