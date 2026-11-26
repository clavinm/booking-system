"use client";

import { SplitText } from "gsap/SplitText";
import { type ReactNode, useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/animations/gsap";
import { desktopMotion, motion, motionAllowed } from "@/lib/animations/motion";

gsap.registerPlugin(SplitText);

function reveal(trigger: HTMLElement, targets: HTMLElement[], from: gsap.TweenVars) {
  if (!targets.length || trigger.getBoundingClientRect().top < 0) return;
  return gsap.from(targets, {
    ...from,
    ease: motion.ease,
    duration: motion.enter,
    stagger: motion.stagger,
    scrollTrigger: { trigger, start: "top bottom", once: true },
  });
}

export function ScrollReveal({ children, className }: { children: ReactNode; className?: string }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const root = scope.current;
    if (!root) return;
    const conditions = gsap.matchMedia();

    conditions.add(motionAllowed, () => {
      const splits = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-title]")).map((title) =>
        SplitText.create(title, {
          type: "lines",
          mask: "lines",
          onSplit: ({ lines }) => reveal(title, lines as HTMLElement[], { yPercent: 105 }),
          autoSplit: true,
        }),
      );

      root.querySelectorAll<HTMLElement>("[data-reveal-group]").forEach((group) => {
        reveal(group, Array.from(group.querySelectorAll<HTMLElement>("[data-reveal-item]")), { y: 18 });
        reveal(group, Array.from(group.querySelectorAll<HTMLElement>("[data-reveal-image]")), { clipPath: "inset(0 0 12% 0)" });
      });

      root.querySelectorAll<HTMLElement>("[data-count]").forEach((element) => {
        const value = Number(element.dataset.count);
        if (!value) return;
        const counter = { value: 0 };
        const finish = () => { element.textContent = String(value); };
        const count = gsap.to(counter, {
          value,
          duration: motion.image,
          ease: motion.ease,
          paused: true,
          snap: { value: 1 },
          onUpdate: () => { element.textContent = String(counter.value); },
          onComplete: finish,
        });
        ScrollTrigger.create({ trigger: element, start: "top 88%", once: true, onEnter: () => count.play() });
      });

      const story = root.querySelector<HTMLElement>("[data-story]");
      const steps = Array.from(root.querySelectorAll<HTMLElement>("[data-story-step]"));
      if (story && steps.length) {
        let currentStep = -1;
        ScrollTrigger.create({
          trigger: story,
          start: "top 82%",
          end: "bottom 44%",
          onUpdate: ({ progress }) => {
            const step = Math.min(steps.length - 1, Math.floor(progress * steps.length));
            story.style.setProperty("--story-progress", String(progress));
            if (step === currentStep) return;
            steps[currentStep]?.removeAttribute("data-current");
            steps[step].setAttribute("data-current", "");
            currentStep = step;
          },
        });
      }

      // The catalog is streamed separately, so it can change the hero's scroll range.
      const frame = requestAnimationFrame(() => ScrollTrigger.refresh());
      return () => {
        cancelAnimationFrame(frame);
        splits.forEach((split) => split.revert());
        root.querySelectorAll<HTMLElement>("[data-count]").forEach((element) => { element.textContent = element.dataset.count ?? ""; });
        story?.style.removeProperty("--story-progress");
        steps.forEach((step) => step.removeAttribute("data-current"));
      };
    }, root);

    conditions.add(desktopMotion, () => {
      root.querySelectorAll<HTMLElement>("[data-parallax-image]").forEach((image) => {
        gsap.fromTo(image, { yPercent: -4, scale: 1.12 }, {
          yPercent: 4,
          scale: 1.12,
          ease: "none",
          scrollTrigger: { trigger: image.parentElement, start: "top bottom", end: "bottom top", scrub: true },
        });
      });
    }, root);

    return () => conditions.revert();
  }, { scope });

  return <div ref={scope} className={className}>{children}</div>;
}
