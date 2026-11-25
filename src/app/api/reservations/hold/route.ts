import { idempotencyRequest, readIdempotencyKey } from "@/services/idempotency";
import { reservationFailure, reservationJson, withReservationUser } from "@/lib/reservation-http";
import { createHold } from "@/services/reservations";
import { holdRequestSchema } from "@/validations/reservation";

export function POST(request: Request) {
  return withReservationUser(request, async (userId) => {
    const body: unknown = await request.json().catch(() => undefined);
    const parsed = holdRequestSchema.safeParse(body);
    if (!parsed.success) {
      return reservationFailure(400, "INVALID_HOLD", "Choose one time slot and up to 50 different seats.");
    }
    const input = { ...parsed.data, seatIds: parsed.data.seatIds.toSorted() };
    const idempotency = idempotencyRequest(userId, "HOLD", readIdempotencyKey(request), input);
    return reservationJson(await createHold(userId, input, idempotency), 201);
  });
}
