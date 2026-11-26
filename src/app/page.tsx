import { Suspense, type ReactNode } from "react";
import { io } from "next/cache";
import { ArrowDown, ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HeroMotion } from "@/components/animations/hero-motion";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { BookingStory } from "@/components/home/booking-story";
import styles from "@/components/home/home.module.css";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { SearchForm } from "@/components/workspaces/search-form";
import { WorkspaceCard } from "@/components/workspaces/workspace-card";
import { getHomeCatalog } from "@/repositories/workspaces";
import { cities } from "@/types/workspace";

const categoryOptions = [
  { id: "library", name: "Libraries", photo: "reading" },
  { id: "coworking", name: "Coworking", photo: "common" },
  { id: "study", name: "Study centres", photo: "quiet" },
  { id: "private", name: "Private offices", photo: "studio" },
] as const;

const cityPhotos = { Mangaluru: "reading", Bengaluru: "common", Hubballi: "studio" } as const;

export default function HomePage() {
  return (
    <>
      <HeroMotion className={styles.heroShell}>
        <div className={`container-wide ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow} data-hero-intro>Workspaces by the hour</p>
            <h1 id="home-title" className={styles.headline}>
              <span className={styles.headlineMask}><span data-hero-line>Great work</span></span>{" "}
              <span className={styles.headlineMask}><span data-hero-line>begins with the</span></span>{" "}
              <span className={styles.headlineMask}><span data-hero-line>right space.</span></span>
            </h1>
            <p className={styles.heroDescription} data-hero-copy>Find a quiet library, a shared desk, or a room of your own. Book the seat and time that fit your day.</p>
          </div>

          <div className={styles.heroSearch} data-hero-search><SearchForm /></div>

          <nav className={styles.quickCities} aria-label="Popular city searches" data-hero-extra>
            <span>Popular cities</span>
            {cities.map((city) => <Link key={city} href={{ pathname: "/workspaces", query: { city } }}>{city}</Link>)}
          </nav>

          <div className={styles.heroVisual}>
            <div className={styles.heroMask} data-hero-mask>
              <div className={styles.heroPhoto} data-hero-parallax>
                <Image src="/workspaces/reading.webp" alt="Sunlight falling across wooden desks and shelves in The Reading Room" fill preload sizes="(max-width: 820px) calc(100vw - 2rem), 58vw" />
              </div>
            </div>
            <Link className={styles.photoCaption} href="/workspaces/the-reading-room" data-hero-extra>
              <MapPin size={17} aria-hidden="true" />
              <span><strong>The Reading Room</strong><small>Kadri, Mangaluru</small></span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className={`container-wide ${styles.heroFooter}`}>
          <a href="#space-types">Explore by space type <ArrowDown size={16} aria-hidden="true" /></a>
        </div>
      </HeroMotion>

      <Suspense fallback={<CatalogSkeleton />}>
        <HomeCatalog />
      </Suspense>
    </>
  );
}

function CatalogSkeleton() {
  return (
    <div className={`container-wide ${styles.catalogSkeleton}`} role="status">
      <span className="sr-only">Loading workspace catalog</span>
      <Skeleton className="skeleton-title" />
      <div className={styles.categoryGrid}>{categoryOptions.map(({ id }) => <Skeleton key={id} className={styles.tileSkeleton} />)}</div>
    </div>
  );
}

async function HomeCatalog() {
  await io();
  const { featured, study, cityCounts } = await getHomeCatalog();
  const workspaceCount = Object.values(cityCounts).reduce((total, count) => total + count, 0);
  const cityCount = Object.values(cityCounts).filter((count) => count > 0).length;

  return (
    <ScrollReveal className={styles.catalog}>
      <section className={`container-wide ${styles.section}`} id="space-types" aria-labelledby="types-title">
        <div className={styles.sectionHeading}>
          <h2 id="types-title" data-reveal-title>Find your kind of space</h2>
        </div>
        <div className={styles.categoryGrid} data-reveal-group>
          {categoryOptions.map(({ id, name, photo }) => (
            <PhotoTile key={id} query={{ category: id }} photo={photo} name={name} />
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className={`container-wide ${styles.section}`} aria-labelledby="featured-title">
          <div className={styles.sectionHeading}>
            <h2 id="featured-title" data-reveal-title>Featured workspaces</h2>
            <Link className={styles.textLink} href="/workspaces">View all spaces <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
          <div className={`workspace-grid ${styles.workspaceGrid}`} data-reveal-group>
            {featured.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} variant="home" />)}
          </div>
        </section>
      )}

      <BookingStory />

      <section className={`container-wide ${styles.section}`} id="locations" aria-labelledby="locations-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="locations-title" data-reveal-title>Find a desk closer to you</h2>
            <p><CatalogCount value={workspaceCount} label="workspace" /> across <CatalogCount value={cityCount} label="city" plural="cities" /></p>
          </div>
        </div>
        <div className={styles.cityGrid} data-reveal-group>
          {cities.map((city) => (
            <PhotoTile key={city} query={{ city }} photo={cityPhotos[city]} name={city} detail={<CatalogCount value={cityCounts[city]} label="space" />} />
          ))}
        </div>
      </section>

      {study.length > 0 && (
        <section className={`container-wide ${styles.section}`} aria-labelledby="study-title">
          <div className={styles.sectionHeading}>
            <h2 id="study-title" data-reveal-title>Spots to settle in and study</h2>
            <Link className={styles.textLink} href="/workspaces?category=study">Browse study centres <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
          <div className={`workspace-grid ${styles.workspaceGrid}`} data-reveal-group>
            {study.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} variant="home" />)}
          </div>
        </section>
      )}

      <section className={`container-wide ${styles.closing}`} aria-labelledby="closing-title" data-reveal-group>
        <div className={styles.closingCopy}>
          <h2 id="closing-title" data-reveal-title>Make room for your next workday.</h2>
          <Link className={buttonVariants()} href="/workspaces" data-reveal-item>Explore workspaces <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className={styles.closingPhoto} data-reveal-image>
          <Image src="/workspaces/quiet.webp" alt="A row of individual study desks" fill sizes="(max-width: 700px) 100vw, 37vw" data-parallax-image />
        </div>
      </section>
    </ScrollReveal>
  );
}

function CatalogCount({ value, label, plural = `${label}s` }: { value: number; label: string; plural?: string }) {
  const noun = value === 1 ? label : plural;
  return <><span className="sr-only">{value} {noun}</span><span aria-hidden="true"><span data-count={value}>{value}</span> {noun}</span></>;
}

function PhotoTile({ query, photo, name, detail }: { query: Record<string, string>; photo: string; name: string; detail?: ReactNode }) {
  return (
    <Link className={styles.photoTile} href={{ pathname: "/workspaces", query }} data-reveal-item>
      <span className={styles.tilePhoto} data-reveal-image>
        <Image src={`/workspaces/${photo}.webp`} alt="" fill sizes="(max-width: 620px) 48vw, (max-width: 960px) 46vw, 34vw" />
      </span>
      <span className={styles.tileLabel}><strong>{name}</strong>{detail && <small>{detail}</small>}</span>
      <span className={styles.tileArrow}><ArrowUpRight size={19} aria-hidden="true" /></span>
    </Link>
  );
}
