import { Armchair, MapPin } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/services/current-user";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="SeatSync home">
      <span className="brand-icon"><Armchair size={21} aria-hidden="true" /></span>
      <span>Seat<span className="brand-accent">Sync</span></span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container-wide header-inner">
        <Brand />
        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/workspaces">Explore spaces</Link>
          <Link href="/#how-it-works">How it works</Link>
        </nav>
        <div className="header-actions">
          <Link className="header-location" href="/#locations"><MapPin size={17} aria-hidden="true" /> Locations</Link>
          <Suspense fallback={<span className="account-nav-placeholder" aria-hidden="true" />}><AccountNavigation /></Suspense>
        </div>
      </div>
    </header>
  );
}

async function AccountNavigation() {
  const user = await getCurrentUser();
  if (user) {
    return <Link className={buttonVariants({ size: "small" })} href="/account">My bookings</Link>;
  }

  return (
    <>
      <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/account">Log in</Link>
      <Link className={buttonVariants({ size: "small" })} href="/account?mode=register">Sign up</Link>
    </>
  );
}
