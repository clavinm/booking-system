import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/booking/booking.module.css";
import { BookingDateForm } from "@/components/booking/booking-date-form";
import { SeatPicker } from "@/components/booking/seat-picker";
import { workspaceDate } from "@/lib/booking-format";
import { getSeatAvailability, getSeatLayout, getUpcomingSlots } from "@/repositories/seats";
import { bookingDateSchema, slotIdSchema, workspaceSlugSchema } from "@/validations/booking";

export const metadata: Metadata = { title: "Choose your seats" };

export default async function SeatsPage({ params, searchParams }: PageProps<"/workspaces/[id]/seats">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!workspaceSlugSchema.safeParse(id).success) notFound();
  const layout = await getSeatLayout(id);
  if (!layout) notFound();

  const { workspace } = layout;
  const today = workspaceDate(workspace.timezone);
  const parsedDate = bookingDateSchema.safeParse(query.date ?? today);
  const validDate = parsedDate.success && parsedDate.data >= today;
  const date = validDate ? parsedDate.data : today;
  const parsedSlot = slotIdSchema.safeParse(query.slotId);
  const slots = validDate ? await getUpcomingSlots(id, date) ?? [] : [];
  const slot = (parsedSlot.success ? slots.find((entry) => entry.id === parsedSlot.data) : undefined) ?? slots[0];
  const hasSeats = layout.sections.some((section) => section.seats.length > 0);
  const initialAvailability = slot && hasSeats ? await getSeatAvailability(id, slot.id) : null;

  return (
    <div className={`container-wide discovery ${styles.page}`}>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/workspaces">Explore spaces</Link><span>/</span>
        <Link href={`/workspaces/${id}`}>{workspace.name}</Link><span>/</span>
        <span aria-current="page">Choose seats</span>
      </nav>
      <div className={styles.pageHeading}>
        <div>
          <h1>Choose your seats</h1>
          <p className={styles.location}><MapPin size={18} aria-hidden="true" /> {workspace.name} · {workspace.neighborhood}, {workspace.city}</p>
        </div>
        <BookingDateForm key={date} workspaceId={id} date={date} earliestDate={today} actionLabel="Change date" compact />
      </div>
      {slot && hasSeats ? (
        <SeatPicker key={`${date}:${slot.id}`} layout={layout} date={date} slots={slots} initialSlot={slot} initialAvailability={initialAvailability} />
      ) : (
        <div className="empty-state">
          <h2>{validDate ? "No seats to choose for this date" : "Choose a valid date"}</h2>
          <p>{validDate ? "Try another date to see upcoming time slots and seats." : "Select today or a future date using the date field."}</p>
        </div>
      )}
    </div>
  );
}
