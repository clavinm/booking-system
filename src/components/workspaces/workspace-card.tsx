import { Armchair, ArrowUpRight, Clock3, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatRupees } from "@/lib/utils";
import { amenities, categories, type Workspace } from "@/types/workspace";

export function WorkspaceCard({ workspace, variant = "catalog" }: { workspace: Workspace; variant?: "catalog" | "home" }) {
  const href = `/workspaces/${workspace.id}`;
  const onHome = variant === "home";

  return (
    <article className="workspace-card" data-reveal-item={onHome ? "" : undefined}>
      <div className="card-photo" data-reveal-image={onHome ? "" : undefined}>
        <Image src={workspace.image.src} alt={workspace.image.alt} fill sizes="(max-width: 560px) 94vw, (max-width: 920px) 46vw, 33vw" />
        <span className="card-category">{categories[workspace.category]}</span>
        <span className="card-rating"><Star size={13} fill="currentColor" aria-hidden="true" /><span className="sr-only">Rating </span>{workspace.rating.toFixed(1)}</span>
      </div>
      <div className="card-content">
        <h3><Link href={href}>{workspace.name}</Link></h3>
        <p className="card-meta"><MapPin size={16} aria-hidden="true" /> {workspace.neighborhood}, {workspace.city}</p>
        <p className="card-meta"><Clock3 size={16} aria-hidden="true" /> {workspace.hours}</p>
        {!onHome && <>
          <ul className="amenity-pills" aria-label="Amenities">
            {workspace.amenities.map((amenity) => <li key={amenity}>{amenities[amenity]}</li>)}
          </ul>
          <p className={`card-availability ${workspace.sampleAvailableSeats === 0 ? "empty-availability" : ""}`}>
            <Armchair size={16} aria-hidden="true" /> {workspace.sampleAvailableSeats > 0 ? `${workspace.sampleAvailableSeats} demo seats available` : "No demo seats available"}
          </p>
        </>}
        <div className="card-bottom">
          <p><span className="price-caption">From</span> <strong>{formatRupees(workspace.hourlyPrice)}</strong><span className="price-caption"> / hr</span></p>
          <Link className={buttonVariants({ variant: "outline", size: "small" })} href={href} aria-label={onHome ? `View space at ${workspace.name}` : `Book now at ${workspace.name}`}>
            {onHome ? <>View space <ArrowUpRight size={16} aria-hidden="true" /></> : "Book now"}
          </Link>
        </div>
      </div>
    </article>
  );
}
