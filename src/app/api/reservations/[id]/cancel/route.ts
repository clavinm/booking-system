import { reservationById } from "@/lib/reservation-http";
import { cancelReservation } from "@/services/reservations";

export async function POST(request: Request, { params }: RouteContext<"/api/reservations/[id]/cancel">) {
  return reservationById(request, (await params).id, cancelReservation);
}
