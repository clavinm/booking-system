import { Suspense } from "react";
import { io } from "next/cache";
import { Armchair, BookOpen, Building2, CalendarDays, DoorClosed, GraduationCap, MapPin, Search, Ticket } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { HeroHeading } from "@/components/workspaces/hero-heading";
import { SearchForm } from "@/components/workspaces/search-form";
import { WorkspaceCard } from "@/components/workspaces/workspace-card";
import { getHomeCatalog } from "@/repositories/workspaces";
import { categories, cities } from "@/types/workspace";

const categoryOptions = [
  { id: "coworking", icon: Building2, description: "Flexible shared desks" },
  { id: "library", icon: BookOpen, description: "A quiet place to read" },
  { id: "study", icon: GraduationCap, description: "Stay focused for longer" },
  { id: "private", icon: DoorClosed, description: "Room to work together" },
] as const;

const bookingSteps = [
  { icon: Search, title: "Find a space", text: "Explore by city and compare prices, amenities and opening hours." },
  { icon: CalendarDays, title: "Choose your time", text: "Pick a date and a time slot that fits your schedule." },
  { icon: Armchair, title: "Reserve your seat", text: "Choose your seat and confirm it through checkout." },
];

export default function HomePage() {
  return (
    <>
      <section className="hero" aria-label="Workspace discovery">
        <div className="hero-photo">
          <Image src="/workspaces/common.webp" alt="" fill preload sizes="(max-width: 760px) 100vw, 68vw" />
        </div>
        <div className="container-wide hero-content">
          <p className="eyebrow hero-eyebrow"><span /> WORKSPACES BY THE HOUR</p>
          <HeroHeading />
          <p className="hero-description">Discover coworking spaces, quiet libraries and study desks for the way you work.</p>
          <SearchForm />
          <nav className="hero-cities" aria-label="Popular city searches">
            <span>Popular</span>
            {cities.map((city) => <Link key={city} href={{ pathname: "/workspaces", query: { city } }}>{city}</Link>)}
          </nav>
        </div>
      </section>

      <Suspense fallback={<div className="container-wide home-content" role="status"><span className="sr-only">Loading workspace catalog</span><Skeleton className="skeleton-card" /></div>}>
        <HomeCatalog />
      </Suspense>
    </>
  );
}

async function HomeCatalog() {
  await io();
  const { featured, study, cityCounts } = await getHomeCatalog();
  return (
    <div className="container-wide home-content">
      <section className="category-grid" aria-label="Browse workspace types">
        {categoryOptions.map(({ id, icon: Icon, description }) => (
          <Link key={id} className="category-tile" href={{ pathname: "/workspaces", query: { category: id } }}>
            <span className={`tile-icon tile-${id}`}><Icon size={22} aria-hidden="true" /></span>
            <span><strong>{categories[id]}</strong><small>{description}</small></span>
          </Link>
        ))}
      </section>

      <section className="home-section" aria-labelledby="featured-title">
        <div className="section-heading">
          <div>
            <h2 id="featured-title">Featured workspaces</h2>
            <p>Explore popular spaces for a focused workday.</p>
          </div>
          <Link className={buttonVariants({ variant: "outline", size: "small" })} href="/workspaces">View all spaces</Link>
        </div>
        <div className="workspace-grid">
          {featured.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} />)}
        </div>
      </section>

      <section className="home-section" id="locations" aria-labelledby="locations-title">
        <div className="section-heading"><div><h2 id="locations-title">Popular locations</h2><p>Find a desk closer to you.</p></div></div>
        <div className="city-grid">
          {cities.map((city) => (
            <Link key={city} className="city-tile" href={{ pathname: "/workspaces", query: { city } }}>
              <span className="tile-icon"><MapPin size={22} aria-hidden="true" /></span>
              <span><strong>{city}</strong><small>{cityCounts[city]} spaces</small></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section" aria-labelledby="study-title">
        <div className="section-heading">
          <div><h2 id="study-title">Recommended study spaces</h2><p>Quiet places to read, revise and focus.</p></div>
          <Link className={buttonVariants({ variant: "outline", size: "small" })} href="/workspaces?category=study">Browse study centres</Link>
        </div>
        <div className="workspace-grid">
          {study.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} />)}
        </div>
      </section>

      <section className="home-section offers" aria-labelledby="offers-title">
        <span className="tile-icon"><Ticket size={25} aria-hidden="true" /></span>
        <div><p className="eyebrow">DEMO OFFER</p><h2 id="offers-title">20% off your first study session</h2>
        <p>Example promotion for the simulated checkout.</p></div>
        <code>FOCUS20</code>
      </section>

      <section className="home-section how-section" id="how-it-works" aria-labelledby="steps-title">
        <div className="section-heading"><h2 id="steps-title">How it works</h2></div>
        <ol className="steps-grid">
          {bookingSteps.map(({ icon: Icon, title, text }) => (
            <li key={title}><span className="tile-icon"><Icon size={23} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
