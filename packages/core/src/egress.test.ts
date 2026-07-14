// egress.test.ts — M07/M08: exit advice across venues × modes × scenarios + bounds.
import { describe, expect, it } from 'vitest';
import { DEPARTURE_CANDIDATES, EGRESS_MODES, adviseEgress, planStaggeredEgress } from './egress';
import { VENUES, VENUE_IDS } from './venues';

const SEED = 26;

describe('adviseEgress across venues × available modes (M07)', () => {
  const cases = VENUE_IDS.flatMap((venueId) =>
    VENUES[venueId].transit
      .map((t) => t.mode)
      .concat('walk')
      .map((mode) => ({ venueId, mode })),
  );

  it.each(cases)('$venueId by $mode returns bounded, deterministic advice', ({ venueId, mode }) => {
    const r = adviseEgress(venueId, mode, 'egress-surge', SEED);
    expect(r.ok, r.ok ? '' : r.error.code).toBe(true);
    if (!r.ok) return;
    expect(r.value.options).toHaveLength(DEPARTURE_CANDIDATES.length);
    for (const o of r.value.options) {
      expect(o.projectedExitMinutes).toBeGreaterThanOrEqual(0);
      expect(o.projectedExitMinutes).toBeLessThan(240);
      expect(DEPARTURE_CANDIDATES).toContain(o.leaveAtMinute);
    }
    // Best option really is the minimum.
    const min = Math.min(...r.value.options.map((o) => o.projectedExitMinutes));
    expect(r.value.bestOption.projectedExitMinutes).toBe(min);
    // Deterministic.
    expect(adviseEgress(venueId, mode, 'egress-surge', SEED)).toEqual(r);
  });
});

describe('advice semantics', () => {
  it('MetLife rail: leaving before full time beats the post-match surge', () => {
    const r = adviseEgress('metlife', 'rail', 'egress-surge', SEED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bestOption.leaveAtMinute).toBeLessThan(105);
    expect(r.value.minutesSavedVsFullTime).toBeGreaterThan(0);
    expect(r.value.explanation).toMatch(/save ~\d+ min/i);
  });

  it('explanations quote the projected minutes they computed', () => {
    const r = adviseEgress('arrowhead', 'bus', 'normal', SEED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.explanation).toContain(`${r.value.bestOption.projectedExitMinutes} min`);
  });

  it.each(EGRESS_MODES)('unknown venue errors typed for mode %s (M08)', (mode) => {
    const r = adviseEgress('narnia-dome', mode, 'normal', SEED);
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
  });

  it('venue without rail reports NOT_FOUND for rail (M08)', () => {
    // Arrowhead is modelled without a rail link (documented: no rail access).
    const r = adviseEgress('arrowhead', 'rail', 'normal', SEED);
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
  });

  it('walking always works even without a modelled walk link (M08)', () => {
    const r = adviseEgress('metlife', 'walk', 'normal', SEED);
    expect(r.ok).toBe(true);
  });
});

describe('planStaggeredEgress', () => {
  it.each(VENUE_IDS)('%s: staggers sections across minutes and gates', (venueId) => {
    const r = planStaggeredEgress(venueId, SEED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBeGreaterThan(0);
    const minutes = new Set(r.value.map((s) => s.releaseAtMinute));
    expect(minutes.size).toBe(r.value.length); // every section gets its own slot
    for (const slot of r.value) {
      expect(slot.releaseAtMinute).toBeGreaterThanOrEqual(108);
      expect(slot.viaGateZoneId).toMatch(/^gate-/);
    }
  });

  it('busiest section releases first', () => {
    const r = planStaggeredEgress('metlife', SEED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const first = r.value[0];
    expect(first?.releaseAtMinute).toBe(108);
  });

  it('unknown venue errors typed', () => {
    const r = planStaggeredEgress('narnia-dome', SEED);
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
  });
});
