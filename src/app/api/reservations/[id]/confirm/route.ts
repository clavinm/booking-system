import { reservationById } from "@/lib/reservation-http";
import { idempotencyRequest, readIdempotencyKey } from "@/services/idempotency";
import { confirmPaidReservation } from "@/services/payments";
import { ReservationError } from "@/services/reservation-error";

export async function POST(request: Request, { params }: RouteContext<"/api/reservations/[id]/confirm">) {
  return reservationById(request, (await params).id, async (id, userId) => {
    const body: unknown = await request.json().catch(() => undefined);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
      throw new ReservationError("INVALID_CONFIRMATION");
    }
    const idempotency = idempotencyRequest(userId, "CONFIRM", readIdempotencyKey(request), { id });
    return confirmPaidReservation(id, userId, idempotency);
  });
}
