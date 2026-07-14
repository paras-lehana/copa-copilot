// sustainability.test.ts — M13: factor invariants + computations across modes × distances.
import { describe, expect, it } from 'vitest';
import {
  COMMUTE_MODES,
  EMISSION_FACTORS_KG_PER_KM,
  commuteFootprint,
  compareCommute,
  sustainabilityTiles,
} from './sustainability';
import { VENUE_IDS } from './venues';

const SEED = 26;

describe('emission factor invariants (M13)', () => {
  it.each(COMMUTE_MODES)('%s factor is finite, non-negative and plausibly bounded', (mode) => {
    const f = EMISSION_FACTORS_KG_PER_KM[mode];
    expect(Number.isFinite(f)).toBe(true);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThan(0.5); // per-passenger-km — anything above this is a unit error
  });

  it('orders as expected: walk < rail < bus < rideshare', () => {
    expect(EMISSION_FACTORS_KG_PER_KM.walk).toBeLessThan(EMISSION_FACTORS_KG_PER_KM.rail);
    expect(EMISSION_FACTORS_KG_PER_KM.rail).toBeLessThan(EMISSION_FACTORS_KG_PER_KM.bus);
    expect(EMISSION_FACTORS_KG_PER_KM.bus).toBeLessThan(EMISSION_FACTORS_KG_PER_KM.rideshare);
  });
});

describe('commuteFootprint across modes × distances (M13)', () => {
  const distances = [1, 5, 10, 15, 20, 40, 80, 120];
  const cases = COMMUTE_MODES.flatMap((mode) => distances.map((km) => ({ mode, km })));

  it.each(cases)('$mode over $km km computes factor × distance', ({ mode, km }) => {
    const o = commuteFootprint(mode, km);
    expect(o.kgCo2e).toBeCloseTo(EMISSION_FACTORS_KG_PER_KM[mode] * km, 2);
    expect(o.kgCo2eSavedVsRideshare).toBeGreaterThanOrEqual(0);
    // Saving + own footprint must equal the rideshare footprint (accounting identity).
    expect(o.kgCo2e + o.kgCo2eSavedVsRideshare).toBeCloseTo(
      EMISSION_FACTORS_KG_PER_KM.rideshare * km,
      1,
    );
  });

  it('rideshare saves nothing versus itself', () => {
    expect(commuteFootprint('rideshare', 20).kgCo2eSavedVsRideshare).toBe(0);
  });

  it('the documented example: rail over 20 km = 0.76 kg', () => {
    expect(commuteFootprint('rail', 20).kgCo2e).toBe(0.76);
  });
});

describe('compareCommute', () => {
  it('sorts greenest first with walk at the top', () => {
    const ranked = compareCommute(15);
    expect(ranked[0]?.mode).toBe('walk');
    expect(ranked[ranked.length - 1]?.mode).toBe('rideshare');
    for (let i = 1; i < ranked.length; i += 1) {
      const current = ranked[i];
      const previous = ranked[i - 1];
      if (current === undefined || previous === undefined) throw new Error('missing option');
      expect(current.kgCo2e).toBeGreaterThanOrEqual(previous.kgCo2e);
    }
  });
});

describe('sustainabilityTiles', () => {
  it.each(VENUE_IDS)('%s tiles are bounded and deterministic', (venueId) => {
    const a = sustainabilityTiles(venueId, 50, SEED);
    const b = sustainabilityTiles(venueId, 50, SEED);
    expect(a).toEqual(b);
    expect(a).toBeDefined();
    if (a === undefined) return;
    expect(a.wasteDivertedPct).toBeGreaterThanOrEqual(0);
    expect(a.wasteDivertedPct).toBeLessThanOrEqual(100);
    expect(a.waterRefills).toBeGreaterThanOrEqual(0);
    expect(a.energyKwh).toBeGreaterThanOrEqual(0);
    expect(a.kgCo2eSavedByTransit).toBeGreaterThanOrEqual(0);
  });

  it('refills accumulate as the matchday progresses', () => {
    const early = sustainabilityTiles('metlife', -60, SEED);
    const late = sustainabilityTiles('metlife', 90, SEED);
    if (early === undefined || late === undefined) throw new Error('tiles missing');
    expect(late.waterRefills).toBeGreaterThan(early.waterRefills);
  });

  it('unknown venue returns undefined', () => {
    expect(sustainabilityTiles('narnia-dome', 50, SEED)).toBeUndefined();
  });
});
