import { reservationById } from "@/lib/reservation-http";
import { getReservation } from "@/services/reservations";

export async function GET(request: Request, { params }: RouteContext<"/api/reservations/[id]">) {
  return reservationById(request, (await params).id, getReservation);
}
