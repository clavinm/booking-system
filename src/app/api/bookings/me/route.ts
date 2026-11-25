import { reservationFailure, reservationJson, withReservationUser } from "@/lib/reservation-http";
import { readUserBookings } from "@/repositories/dashboard";
import { bookingQuery } from "@/validations/dashboard";

export function GET(request: Request) {
  return withReservationUser(request, async (userId) => {
    const parsed = bookingQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return reservationFailure(400, "INVALID_BOOKING_FILTER", "Choose a valid booking filter and page.");
    const { view, page } = parsed.data;
    return reservationJson(await readUserBookings(userId, view, page));
  });
}
