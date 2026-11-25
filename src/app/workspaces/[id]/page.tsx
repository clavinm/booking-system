import { Clock3, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import styles from "@/components/booking/booking.module.css";
import { BookingDateForm } from "@/components/booking/booking-date-form";
import { buttonVariants } from "@/components/ui/button";
import { slotLabel, workspaceDate } from "@/lib/booking-format";
import { getUpcomingSlots } from "@/repositories/seats";
import { formatRupees } from "@/lib/utils";
import { getWorkspace } from "@/repositories/workspaces";
import { amenities, categories } from "@/types/workspace";

const readWorkspace = cache(getWorkspace);

export async function generateMetadata({ params }: PageProps<"/workspaces/[id]">) {
  const workspace = await readWorkspace((await params).id);
  return { title: workspace?.name ?? "Workspace unavailable" };
}

export default async function WorkspaceDetails({ params }: PageProps<"/workspaces/[id]">) {
  const workspace = await readWorkspace((await params).id);
  if (!workspace) notFound();
  const today = workspaceDate(workspace.timezone);
  const slots = await getUpcomingSlots(workspace.id, today) ?? [];

  return (
    <div className="container-wide discovery workspace-detail">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/workspaces">Explore spaces</Link><span>/</span><span aria-current="page">{workspace.name}</span></nav>
      <div className="details-title">
        <p className="eyebrow">{categories[workspace.category]}</p>
        <h1>{workspace.name}</h1>
        <p className="card-meta"><MapPin size={18} aria-hidden="true" />{workspace.neighborhood}, {workspace.city}</p>
      </div>
      <div className="details-photo"><Image src={workspace.image.src} alt={workspace.image.alt} fill preload sizes="(max-width: 760px) 94vw, 1180px" /></div>
      <div className="details-layout">
        <div>
          <h2>About this space</h2>
          <p>{workspace.description}</p>
          <h2>Address</h2>
          <p>{workspace.address}</p>
          <h2>Amenities</h2>
          <ul className="amenity-pills" aria-label="Amenities">{workspace.amenities.map((amenity) => <li key={amenity}>{amenities[amenity]}</li>)}</ul>
        </div>
        <aside className="details-summary" aria-label="Workspace summary">
          <p className="detail-price"><strong>{formatRupees(workspace.hourlyPrice)}</strong><span> / hour</span></p>
          <p className="card-meta"><Clock3 size={18} aria-hidden="true" /> {workspace.hours} {workspace.timezone === "Asia/Kolkata" ? "IST" : workspace.timezone}</p>
          <p className="card-meta"><Star size={18} aria-hidden="true" /> {workspace.rating.toFixed(1)} demo rating</p>
          <hr />
          <BookingDateForm workspaceId={workspace.id} date={today} earliestDate={today} actionLabel="Choose seats" />
          {slots.length > 0 && (
            <div className={styles.upcomingSlots}>
              <p>Upcoming time slots today</p>
              <ul>
                {slots.slice(0, 3).map((slot) => (
                  <li key={slot.id}>
                    <Link href={{ pathname: `/workspaces/${workspace.id}/seats`, query: { date: today, slotId: slot.id } }} className={buttonVariants({ variant: "outline", size: "small" })}>
                      {slotLabel(slot, workspace.timezone)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
