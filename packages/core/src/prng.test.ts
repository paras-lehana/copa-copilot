// prng.test.ts — determinism guarantees for the seeded generator.
import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, range } from './prng';

describe('createRng', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = createRng(26);
    const b = createRng(26);
    for (let i = 0; i < 50; i += 1) expect(a()).toBe(b());
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)();
    const b = createRng(2)();
    expect(a).not.toBe(b);
  });

  it.each([0, 1, 26, 2026, 0xffffffff])('stays in [0,1) for seed %d', (seed) => {
    const rng = createRng(seed);
    for (let i = 0; i < 200; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('deriveSeed', () => {
  it('is stable for the same key', () => {
    expect(deriveSeed(26, 'metlife:gate-d')).toBe(deriveSeed(26, 'metlife:gate-d'));
  });

  it.each([
    ['metlife:gate-a', 'metlife:gate-b'],
    ['a', 'b'],
    ['zone:1', 'zone:2'],
  ])('differs across keys %s vs %s', (k1, k2) => {
    expect(deriveSeed(26, k1)).not.toBe(deriveSeed(26, k2));
  });

  it('differs across parent seeds for the same key', () => {
    expect(deriveSeed(1, 'k')).not.toBe(deriveSeed(2, 'k'));
  });
});

describe('range', () => {
  it.each([
    [0, 10],
    [-6, 6],
    [100, 200],
  ])('maps into [%d, %d)', (min, max) => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i += 1) {
      const v = range(rng, min, max);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThan(max);
    }
  });
});
