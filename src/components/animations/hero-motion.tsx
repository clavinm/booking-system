"use client";

import { type ReactNode, useRef } from "react";
import { gsap, useGSAP } from "@/lib/animations/gsap";
import { desktopMotion, motion, motionAllowed } from "@/lib/animations/motion";

export function HeroMotion({ children, className }: { children: ReactNode; className: string }) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(() => {
    const hero = scope.current;
    if (!hero) return;
    const conditions = gsap.matchMedia();

    conditions.add(motionAllowed, () => {
      // Avoid replaying an offscreen entrance when the browser restores scroll.
      if (hero.getBoundingClientRect().bottom <= 0) return;
      gsap.timeline({ defaults: { ease: motion.ease, duration: motion.enter } })
        .fromTo("[data-hero-mask]", { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: motion.hero, ease: motion.reveal }, 0)
        .from("[data-hero-intro]", { opacity: 0, y: 8 }, 0.06)
        .from("[data-hero-line]", { yPercent: 105, stagger: motion.stagger, duration: 0.68, ease: motion.reveal }, 0.12)
        .from("[data-hero-copy]", { opacity: 0, y: 10 }, 0.32)
        .from("[data-hero-search]", { opacity: 0.55, y: 9 }, 0.39)
        .from("[data-hero-action]", { opacity: 0.65, y: 4 }, 0.48)
        .from("[data-hero-extra]", { opacity: 0.35, y: 7, stagger: motion.stagger }, 0.53);
    }, hero);

    conditions.add(desktopMotion, () => {
      gsap.fromTo("[data-hero-parallax]", { yPercent: -3, scale: 1.07 }, {
        yPercent: 5,
        scale: 1.12,
        ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
      });
      let active = true;
      let disconnect: (() => void) | undefined;
      void import("@/components/animations/smooth-scroll").then(({ connectSmoothScroll }) => {
        if (active) disconnect = connectSmoothScroll();
      }).catch(() => {
        // Keep native scrolling if the enhancement cannot load.
      });

      return () => {
        active = false;
        disconnect?.();
      };
    }, hero);

    return () => conditions.revert();
  }, { scope });

  return <section className={className} ref={scope} aria-labelledby="home-title">{children}</section>;
}
