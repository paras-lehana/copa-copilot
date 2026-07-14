// routing.test.ts — M04/M05/M06: profiles × scenarios × od-pairs, hard constraints,
// and engine-quoted explanations.
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './crowd';
import { ACCESSIBILITY_PROFILES, recommendRoute } from './routing';
import { buildStadiumGraph } from './stadium-graph';

const SEED = 26;

/** Six representative origin→destination pairs on the flagship graph. */
const OD_PAIRS = [
  ['gate-d', 'sec-124'],
  ['gate-a', 'sec-345'],
  ['transit-rail', 'sec-111'],
  ['gate-e', 'food-n'],
  ['sec-138', 'hydration-w'],
  ['transit-bus', 'firstaid-e'],
] as const;

describe('route computation across profiles × scenarios × pairs (M04)', () => {
  // 4 profiles × 4 scenarios × 6 pairs = 96 cases (+ determinism inside each).
  const cases = ACCESSIBILITY_PROFILES.flatMap((profile) =>
    SCENARIOS.flatMap((scenario) =>
      OD_PAIRS.map(([from, to]) => ({ profile, scenario, from, to })),
    ),
  );

  it.each(cases)('$profile / $scenario: $from → $to', ({ profile, scenario, from, to }) => {
    const r = recommendRoute('metlife', from, to, profile, scenario, 30, SEED);
    expect(r.ok, r.ok ? '' : r.error.code).toBe(true);
    if (!r.ok) return;
    expect(r.value.legs.length).toBeGreaterThan(0);
    expect(r.value.totalMeters).toBeGreaterThan(0);
    expect(r.value.etaMinutes).toBeGreaterThanOrEqual(1);
    // Path is contiguous.
    for (let i = 1; i < r.value.legs.length; i += 1) {
      expect(r.value.legs[i]?.fromZoneId).toBe(r.value.legs[i - 1]?.toZoneId);
    }
    // Deterministic.
    const again = recommendRoute('metlife', from, to, profile, scenario, 30, SEED);
    expect(again).toEqual(r);
  });
});

describe('hard constraints (M05)', () => {
  it.each(SCENARIOS)('wheelchair routes are 100%% step-free in %s', (scenario) => {
    for (const [from, to] of OD_PAIRS) {
      const r = recommendRoute('metlife', from, to, 'wheelchair', scenario, 30, SEED);
      if (!r.ok) continue; // an unreachable pair must be reported, not silently unsafe
      for (const leg of r.value.legs) expect(leg.stepFree).toBe(true);
    }
  });

  it('wheelchair upper-tier route uses the lift path, not the stairs', () => {
    const r = recommendRoute('metlife', 'gate-b', 'sec-224', 'wheelchair', 'normal', 30, SEED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The stairs edge to sec-224 is not step-free; the lift route is 150m via sec-248 side.
    for (const leg of r.value.legs) expect(leg.stepFree).toBe(true);
  });

  it('critical zones are avoided when an alternative exists (egress surge)', () => {
    const r = recommendRoute('metlife', 'sec-124', 'gate-e', 'none', 'egress-surge', 130, SEED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Either it found a clear path, or it honestly reports unavoidable-critical.
    if (r.value.risk !== 'unavoidable-critical') {
      for (const leg of r.value.legs) expect(leg.zoneStatus).not.toBe('critical');
    } else {
      expect(r.value.explanation).toMatch(/No fully clear path/);
    }
  });

  it('same start and end is a zero-leg safe route', () => {
    const r = recommendRoute('metlife', 'gate-a', 'gate-a', 'none', 'normal', 0, SEED);
    expect(r.ok && r.value.legs.length).toBe(0);
    expect(r.ok && r.value.risk).toBe('safe');
  });

  it('unknown venue and unknown zones return typed errors', () => {
    const badVenue = recommendRoute('narnia', 'a', 'b', 'none', 'normal', 0, SEED);
    expect(!badVenue.ok && badVenue.error.code).toBe('NOT_FOUND');
    const badZone = recommendRoute('metlife', 'gate-a', 'sec-999', 'none', 'normal', 0, SEED);
    expect(!badZone.ok && badZone.error.code).toBe('NOT_FOUND');
  });
});

describe('explanations quote engine numbers (M06)', () => {
  it.each(ACCESSIBILITY_PROFILES)('%s explanation includes computed density and ETA', (profile) => {
    const r = recommendRoute('metlife', 'gate-d', 'sec-124', profile, 'normal', 30, SEED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.explanation).toMatch(/\d+% density/);
    if (r.value.risk !== 'unavoidable-critical') {
      expect(r.value.explanation).toContain(`ETA ${r.value.etaMinutes} min`);
      expect(r.value.explanation).toContain(`${r.value.totalMeters} m`);
    }
  });

  it('every leg carries a human instruction', () => {
    const r = recommendRoute('metlife', 'transit-rail', 'sec-111', 'none', 'normal', -30, SEED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const leg of r.value.legs) {
      expect(leg.instruction).toMatch(/^(Continue|Take the stairs) \d+ m to /);
    }
  });
});

describe('performance guard', () => {
  it('solves 100 flagship routes well under the 5ms/route budget', () => {
    const graph = buildStadiumGraph('metlife');
    expect(graph).toBeDefined();
    const start = performance.now();
    for (let i = 0; i < 100; i += 1) {
      recommendRoute('metlife', 'transit-rail', 'sec-345', 'none', 'normal', 30, SEED + i);
    }
    const perRoute = (performance.now() - start) / 100;
    expect(perRoute).toBeLessThan(5);
  });
});
