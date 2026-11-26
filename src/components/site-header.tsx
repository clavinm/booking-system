import { Armchair } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { HeaderNavigation } from "@/components/home/header-navigation";
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
  const account = <Suspense fallback={<span className="account-nav-placeholder" aria-hidden="true" />}><AccountNavigation /></Suspense>;

  return (
    <Suspense fallback={
      <header className="site-header">
        <div className="container-wide header-inner">
          <Brand />
          <nav className="header-fallback" aria-label="Main navigation"><Link href="/workspaces">Explore spaces</Link></nav>
          <div className="header-actions">{account}</div>
        </div>
      </header>
    }>
      <HeaderNavigation brand={<Brand />} account={account} />
    </Suspense>
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
