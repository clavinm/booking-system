import { Armchair, Clock3, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatRupees } from "@/lib/utils";
import { amenities, categories, type Workspace } from "@/types/workspace";

export function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const href = `/workspaces/${workspace.id}`;

  return (
    <article className="workspace-card">
      <div className="card-photo">
        <Image src={workspace.image.src} alt={workspace.image.alt} fill sizes="(max-width: 560px) 94vw, (max-width: 920px) 46vw, 33vw" />
        <span className="card-category">{categories[workspace.category]}</span>
        <span className="card-rating"><Star size={13} fill="currentColor" aria-hidden="true" /><span className="sr-only">Rating </span>{workspace.rating.toFixed(1)}</span>
      </div>
      <div className="card-content">
        <h3><Link href={href}>{workspace.name}</Link></h3>
        <p className="card-meta"><MapPin size={16} aria-hidden="true" /> {workspace.neighborhood}, {workspace.city}</p>
        <p className="card-meta"><Clock3 size={16} aria-hidden="true" /> {workspace.hours}</p>
        <ul className="amenity-pills" aria-label="Amenities">
          {workspace.amenities.map((amenity) => <li key={amenity}>{amenities[amenity]}</li>)}
        </ul>
        <p className={`card-availability ${workspace.sampleAvailableSeats === 0 ? "empty-availability" : ""}`}>
          <Armchair size={16} aria-hidden="true" /> {workspace.sampleAvailableSeats > 0 ? `${workspace.sampleAvailableSeats} demo seats available` : "No demo seats available"}
        </p>
        <div className="card-bottom">
          <p><span className="price-caption">From</span> <strong>{formatRupees(workspace.hourlyPrice)}</strong><span className="price-caption"> / hr</span></p>
          <Link className={buttonVariants({ variant: "outline", size: "small" })} href={href} aria-label={`Book now at ${workspace.name}`}>Book now</Link>
        </div>
      </div>
    </article>
  );
}
