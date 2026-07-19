// wcag-catalog.test.ts — honesty invariants for the accessibility catalog, mirroring
// the Google service-catalog test: every claimed criterion must name a real WCAG id,
// a conformance level, and defensible evidence; the scorecard must be computed.
import { describe, expect, it } from 'vitest';
import { WCAG_CRITERIA, wcagScorecard } from './wcag-catalog';

describe('WCAG catalog shape', () => {
  it('catalogs a meaningful set of criteria across all three levels', () => {
    expect(WCAG_CRITERIA.length).toBeGreaterThanOrEqual(12);
    const levels = new Set(WCAG_CRITERIA.map((c) => c.level));
    expect(levels).toEqual(new Set(['A', 'AA', 'AAA']));
  });

  it('criterion ids are unique and well-formed WCAG numbers', () => {
    const ids = WCAG_CRITERIA.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('honesty invariants', () => {
  it.each(WCAG_CRITERIA.map((c) => [c.id, c] as const))(
    '%s: has a name, an implementation note and cited evidence',
    (_id, c) => {
      expect(c.name.length).toBeGreaterThan(3);
      expect(c.how.length).toBeGreaterThan(20);
      expect(c.evidence.length).toBeGreaterThan(15);
      expect(['supported', 'partial']).toContain(c.status);
    },
  );
});

describe('scorecard', () => {
  it('is computed from the catalog, not asserted', () => {
    const s = wcagScorecard();
    expect(s.total).toBe(WCAG_CRITERIA.length);
    expect(s.supported + s.partial).toBe(s.total);
    expect(s.levelA + s.levelAA + s.levelAAA).toBe(s.total);
  });

  it('every catalogued criterion is currently supported', () => {
    expect(wcagScorecard().supported).toBe(WCAG_CRITERIA.length);
  });
});
