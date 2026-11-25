import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReservationDetails } from "@/components/booking/reservation-details";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/services/current-user";
import { getCheckoutPaymentStatus } from "@/services/payments";
import { ReservationError } from "@/services/reservation-error";
import { getReservation } from "@/services/reservations";
import { reservationIdSchema } from "@/validations/reservation";

export const metadata = { title: "Reservation", robots: { index: false, follow: false } };

async function ReservationContent({ params }: Pick<PageProps<"/reservations/[id]">, "params">) {
  const [user, { id }] = await Promise.all([getCurrentUser(), params]);
  if (!user) {
    return (
      <div className="empty-state">
        <h1>Log in to view your reservation</h1>
        <Link href="/account" className={buttonVariants()}>Log in</Link>
      </div>
    );
  }

  const parsed = reservationIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const reservation = await getReservation(parsed.data, user.id).catch((error: unknown) => {
    if (error instanceof ReservationError && error.status === 404) notFound();
    throw error;
  });
  const payment = await getCheckoutPaymentStatus(reservation.id, user.id);
  return <ReservationDetails initial={reservation} initialPayment={payment} />;
}

export default function ReservationPage({ params }: PageProps<"/reservations/[id]">) {
  return (
    <div className="container-wide discovery">
      <Suspense fallback={<Skeleton className="account-card account-skeleton" role="status"><span className="sr-only">Loading reservation</span></Skeleton>}>
        <ReservationContent params={params} />
      </Suspense>
    </div>
  );
}
