// crowd.test.ts — M01/M02/M03: simulation correctness, determinism and thresholds
// across scenarios × phases × venues (test.each matrices).
import { describe, expect, it } from 'vitest';
import {
  BUSY_THRESHOLD,
  CRITICAL_THRESHOLD,
  MATCH_PHASES,
  SCENARIOS,
  phaseForMinute,
  simulateVenue,
  simulateWindow,
} from './crowd';
import { VENUE_IDS } from './venues';

/** One representative minute inside each phase. */
const PHASE_MINUTE = {
  'pre-gates': -180,
  ingress: -30,
  'first-half': 20,
  halftime: 50,
  'second-half': 80,
  'final-whistle': 110,
  egress: 130,
} as const;

const SEED = 26;

describe('phaseForMinute', () => {
  it.each([
    [-180, 'pre-gates'],
    [-121, 'pre-gates'],
    [-120, 'ingress'],
    [-1, 'ingress'],
    [0, 'first-half'],
    [44, 'first-half'],
    [45, 'halftime'],
    [59, 'halftime'],
    [60, 'second-half'],
    [104, 'second-half'],
    [105, 'final-whistle'],
    [114, 'final-whistle'],
    [115, 'egress'],
    [240, 'egress'],
  ] as const)('minute %d → %s', (minute, phase) => {
    expect(phaseForMinute(minute)).toBe(phase);
  });
});

describe('snapshot correctness across scenarios × phases × venues (M01)', () => {
  // 4 scenarios × 7 phases × 16 venues = 448 cases.
  const cases = SCENARIOS.flatMap((scenario) =>
    MATCH_PHASES.flatMap((phase) =>
      VENUE_IDS.map((venueId) => ({ scenario, phase, venueId })),
    ),
  );

  it.each(cases)('$venueId / $scenario / $phase yields a bounded snapshot', ({ scenario, phase, venueId }) => {
    const snap = simulateVenue(venueId, scenario, PHASE_MINUTE[phase], SEED);
    expect(snap).toBeDefined();
    if (snap === undefined) return;
    expect(snap.phase).toBe(phase);
    expect(snap.zones.length).toBeGreaterThan(10);
    expect(snap.transit.length).toBeGreaterThanOrEqual(2);
    for (const z of snap.zones) {
      expect(z.densityPct).toBeGreaterThanOrEqual(0);
      expect(z.densityPct).toBeLessThanOrEqual(100);
      expect(z.queueMinutes).toBeGreaterThanOrEqual(0);
      expect(z.queueMinutes).toBeLessThanOrEqual(45);
    }
    for (const t of snap.transit) {
      expect(t.utilizationPct).toBeGreaterThanOrEqual(0);
      expect(t.utilizationPct).toBeLessThanOrEqual(100);
      expect(t.waitMinutes).toBeGreaterThan(0);
    }
  });
});

describe('determinism (M02)', () => {
  // 4 scenarios × 16 venues = 64 cases: identical inputs ⇒ identical snapshots.
  const cases = SCENARIOS.flatMap((scenario) => VENUE_IDS.map((venueId) => ({ scenario, venueId })));

  it.each(cases)('$venueId / $scenario reproduces exactly with the same seed', ({ scenario, venueId }) => {
    const a = simulateVenue(venueId, scenario, 130, SEED);
    const b = simulateVenue(venueId, scenario, 130, SEED);
    expect(a).toEqual(b);
  });

  it('different seeds change the picture', () => {
    const a = simulateVenue('metlife', 'normal', 50, 1);
    const b = simulateVenue('metlife', 'normal', 50, 2);
    expect(a).not.toEqual(b);
  });
});

describe('status thresholds & scenario semantics (M03)', () => {
  it.each(
    SCENARIOS.flatMap((s) => MATCH_PHASES.map((p) => ({ scenario: s, phase: p }))),
  )('statuses follow documented thresholds in $scenario / $phase', ({ scenario, phase }) => {
    const snap = simulateVenue('metlife', scenario, PHASE_MINUTE[phase], SEED);
    if (snap === undefined) throw new Error('snapshot missing');
    for (const z of snap.zones) {
      if (z.densityPct >= CRITICAL_THRESHOLD) expect(z.status).toBe('critical');
      else if (z.densityPct >= BUSY_THRESHOLD) expect(z.status).toBe('busy');
      else expect(z.status).toBe('comfortable');
    }
  });

  it('egress-surge stresses transit hubs beyond normal during egress (MetLife replay)', () => {
    const normal = simulateVenue('metlife', 'normal', 130, SEED);
    const surge = simulateVenue('metlife', 'egress-surge', 130, SEED);
    if (normal === undefined || surge === undefined) throw new Error('snapshot missing');
    const hub = (s: typeof normal) =>
      s.zones.filter((z) => z.kind === 'transit-hub').reduce((a, z) => a + z.densityPct, 0);
    expect(hub(surge)).toBeGreaterThanOrEqual(hub(normal));
  });

  it('gate-bottleneck raises gate pressure during ingress (Arrowhead replay)', () => {
    const normal = simulateVenue('arrowhead', 'normal', -30, SEED);
    const jam = simulateVenue('arrowhead', 'gate-bottleneck', -30, SEED);
    if (normal === undefined || jam === undefined) throw new Error('snapshot missing');
    const gates = (s: typeof normal) =>
      s.zones.filter((z) => z.kind === 'gate').reduce((a, z) => a + z.densityPct, 0);
    expect(gates(jam)).toBeGreaterThan(gates(normal));
  });

  it('weather-hold moves people off sections into concourses', () => {
    const normal = simulateVenue('lincoln-philadelphia', 'normal', 50, SEED);
    const hold = simulateVenue('lincoln-philadelphia', 'weather-hold', 50, SEED);
    if (normal === undefined || hold === undefined) throw new Error('snapshot missing');
    const kindAvg = (s: typeof normal, kind: string) => {
      const zs = s.zones.filter((z) => z.kind === kind);
      return zs.reduce((a, z) => a + z.densityPct, 0) / zs.length;
    };
    expect(kindAvg(hold, 'concourse')).toBeGreaterThan(kindAvg(normal, 'concourse'));
    expect(kindAvg(hold, 'section')).toBeLessThan(kindAvg(normal, 'section'));
  });
});

describe('simulateWindow', () => {
  it('returns inclusive stepped snapshots', () => {
    const series = simulateWindow('metlife', SEED, 105, 135, 10, 'egress-surge');
    expect(series.map((s) => s.minute)).toEqual([105, 115, 125, 135]);
  });

  it('is itself reproducible', () => {
    expect(simulateWindow('metlife', SEED, 0, 20, 5)).toEqual(
      simulateWindow('metlife', SEED, 0, 20, 5),
    );
  });

  it('skips unknown venues gracefully', () => {
    expect(simulateWindow('narnia-dome', SEED, 0, 10)).toEqual([]);
  });
});
