import Lenis from "lenis";
import { ScrollTrigger } from "@/lib/animations/gsap";

export function connectSmoothScroll() {
  const lenis = new Lenis({
    lerp: 0.145,
    syncTouch: false,
    allowNestedScroll: true,
    prevent: (target) => target.matches("dialog, [role='dialog'], select, [data-native-scroll]"),
  });
  let frame = 0;

  function tick(time: number) {
    lenis.raf(time);
    frame = lenis.isScrolling === "smooth" ? requestAnimationFrame(tick) : 0;
  }

  const stopUpdating = lenis.on("scroll", ScrollTrigger.update);
  const stopListening = lenis.on("virtual-scroll", ({ event }) => {
    if (frame || event.type !== "wheel" || event.ctrlKey) return;
    lenis.raf(performance.now());
    frame = requestAnimationFrame(tick);
  });

  return () => {
    cancelAnimationFrame(frame);
    stopUpdating();
    stopListening();
    lenis.destroy();
  };
}
