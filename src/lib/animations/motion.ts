export const motion = {
  enter: 0.52,
  image: 0.82,
  hero: 0.96,
  stagger: 0.075,
  ease: "power3.out",
  reveal: "power4.out",
} as const;

export const motionAllowed = "(prefers-reduced-motion: no-preference)";
export const desktopMotion = `${motionAllowed} and (min-width: 54rem) and (hover: hover) and (pointer: fine)`;
