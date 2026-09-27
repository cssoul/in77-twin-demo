/**
 * Deterministic helpers. Every "random" value in this project is a pure
 * function of an index, so scrubbing the construction timeline back and forth
 * reproduces the exact same city. Never call Math.random() in geometry code.
 */

export const TAU = Math.PI * 2;

/** Hash-ish value in [0, 1) for an integer or float key. */
export function variation(n: number) {
  return (((Math.sin(n * 127.1 + 31.7) * 43758.5453) % 1) + 1) % 1;
}

/** LCG for texture painting and object scatter. */
export function makeRandom(seed = 1) {
  let s = Math.floor(seed) >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Pick `count` values spread over [a, b] with a deterministic jitter. */
export function spread(count: number, a: number, b: number, seed = 0, jitter = 0) {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push(lerp(a, b, t) + (variation(seed + i * 7.13) - 0.5) * jitter);
  }
  return out;
}
