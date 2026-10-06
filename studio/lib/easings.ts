// Easing helpers for the canvas renderer. Every function takes t in [0,1].
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutCubic = (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number) => { const c1 = 1.20158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/** Eased progress of time t through the window [start, start + duration]. */
export function seg(t: number, start: number, duration: number, ease: (x: number) => number = easeOutQuint) {
  if (duration <= 0) return t >= start ? 1 : 0;
  return ease(clamp01((t - start) / duration));
}

/** Deterministic pseudo-random in [0,1) from an integer seed, so grain never changes between preview and export. */
export function hashRandom(seed: number) {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
