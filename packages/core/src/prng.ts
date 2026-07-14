// prng.ts — deterministic pseudo-random number generation for the simulation engine.
// Boundary: core NEVER calls Math.random() or Date.now(); every stochastic value flows
// from a caller-supplied seed so any number shown in the UI is reproducible in a test.

/** A deterministic generator returning floats in [0, 1). */
export type Rng = () => number;

/**
 * Create a mulberry32 PRNG from a 32-bit integer seed.
 *
 * Deterministic: the same seed always yields the same sequence, which is what makes
 * every simulated crowd/queue/weather value assertable in tests.
 *
 * @example
 * const rng = createRng(26);
 * const a = rng(); // always the same value for seed 26
 * const b = createRng(26)(); // b === a
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a stable sub-seed from a parent seed and a string key.
 * Used to give each venue/zone its own independent-but-reproducible stream.
 *
 * @example
 * const zoneSeed = deriveSeed(26, 'metlife:gate-d');
 */
export function deriveSeed(seed: number, key: string): number {
  let hash = seed >>> 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic value in [min, max) drawn from the given rng.
 *
 * @example
 * range(createRng(1), 10, 20); // stable value in [10, 20)
 */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
