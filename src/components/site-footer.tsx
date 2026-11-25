import Link from "next/link";
import { Brand } from "@/components/site-header";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container-wide footer-inner">
        <div>
          <Brand />
          <p>Find your space. Book your seat.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/workspaces">Explore spaces</Link>
          <Link href="/#locations">Locations</Link>
          <Link href="/#how-it-works">How it works</Link>
        </nav>
        <p className="footer-note">SeatSync · Demo catalog</p>
      </div>
    </footer>
  );
}
