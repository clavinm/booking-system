"use client";

import { ArrowUpRight, ChevronDown, MapPin } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cities } from "@/types/workspace";

export function HeaderNavigation({ brand, account }: { brand: ReactNode; account: ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const locations = useRef<HTMLDetailsElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const browse = pathname.startsWith("/workspaces");

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 18);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    menu.current?.close();
    if (locations.current) locations.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 48rem)");
    const closeMobile = () => { if (desktop.matches) menu.current?.close(); };
    desktop.addEventListener("change", closeMobile);

    const closeOnOutside = (event: PointerEvent) => {
      const dropdown = locations.current;
      if (dropdown?.open && event.target instanceof Node && !dropdown.contains(event.target)) dropdown.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => {
      desktop.removeEventListener("change", closeMobile);
      document.removeEventListener("pointerdown", closeOnOutside);
    };
  }, []);

  function openMenu() {
    menu.current?.showModal();
    setMenuOpen(true);
  }

  function closeMenu() {
    menu.current?.close();
  }

  return (
    <header className="site-header" data-home-header={pathname === "/" ? "" : undefined} data-scrolled={scrolled ? "" : undefined}>
      <div className="container-wide header-inner" data-header-enter>
        {brand}
        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/workspaces" data-active={browse ? "" : undefined} aria-current={pathname === "/workspaces" ? "page" : undefined}>Explore spaces</Link>
          <details className="nav-locations" ref={locations} onKeyDown={(event) => {
            if (event.key === "Escape" && event.currentTarget.open) {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}>
            <summary>Locations <ChevronDown size={15} aria-hidden="true" /></summary>
            <div className="nav-location-panel">
              {cities.map((city) => <Link key={city} href={{ pathname: "/workspaces", query: { city } }} onNavigate={() => { if (locations.current) locations.current.open = false; }}><MapPin size={16} aria-hidden="true" /> {city}</Link>)}
              <Link href="/#locations" onNavigate={() => { if (locations.current) locations.current.open = false; }}>All locations <ArrowUpRight size={15} aria-hidden="true" /></Link>
            </div>
          </details>
          <Link href="/#how-it-works">How it works</Link>
        </nav>
        <div className="header-actions">{account}</div>
        <button type="button" className="mobile-menu-toggle" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={openMenu}>
          <span aria-hidden="true" /><span aria-hidden="true" />
        </button>
      </div>

      <dialog id="mobile-navigation" className="mobile-menu" ref={menu} aria-labelledby="mobile-menu-title" onClose={() => setMenuOpen(false)} onClick={(event) => {
        if (event.target instanceof Element && event.target.closest(".mobile-menu-account a") && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) closeMenu();
      }} data-native-scroll>
        <div className="container-wide mobile-menu-inner">
          <div className="mobile-menu-top">
            <h2 id="mobile-menu-title">SeatSync menu</h2>
            <button type="button" className="mobile-menu-toggle mobile-menu-close" aria-label="Close navigation" onClick={closeMenu}>
              <span aria-hidden="true" /><span aria-hidden="true" />
            </button>
          </div>
          <nav className="mobile-menu-links" aria-label="Mobile navigation">
            <Link href="/workspaces" onNavigate={closeMenu} aria-current={pathname === "/workspaces" ? "page" : undefined}>Explore spaces <ArrowUpRight aria-hidden="true" /></Link>
            <Link href="/#locations" onNavigate={closeMenu}>Locations <ArrowUpRight aria-hidden="true" /></Link>
            <Link href="/#how-it-works" onNavigate={closeMenu}>How it works <ArrowUpRight aria-hidden="true" /></Link>
          </nav>
          <div className="mobile-menu-account">{account}</div>
        </div>
      </dialog>
    </header>
  );
}
