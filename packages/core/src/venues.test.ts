// venues.test.ts — M31: registry invariants across all 16 venues.
import { describe, expect, it } from 'vitest';
import { CLIMATE_CONTROLLED_COUNT, VENUES, VENUE_IDS, getVenue } from './venues';

describe('venue registry invariants (M31)', () => {
  it('contains exactly 16 venues', () => {
    expect(VENUE_IDS).toHaveLength(16);
  });

  it('has exactly 5 climate-controlled venues (Dallas, Houston, Atlanta, Vancouver, LA)', () => {
    expect(CLIMATE_CONTROLLED_COUNT).toBe(5);
    const controlled = VENUE_IDS.filter((id) => VENUES[id].climateControlled).sort();
    expect(controlled).toEqual(
      ['att-dallas', 'bcplace-vancouver', 'mercedes-benz-atlanta', 'nrg-houston', 'sofi-la'].sort(),
    );
  });

  it('spans the three host countries', () => {
    const countries = new Set(VENUE_IDS.map((id) => VENUES[id].country));
    expect(countries).toEqual(new Set(['USA', 'Canada', 'Mexico']));
  });

  it.each(VENUE_IDS)('%s has coherent data', (id) => {
    const v = VENUES[id];
    expect(v.id).toBe(id);
    expect(v.name.length).toBeGreaterThan(3);
    expect(v.capacity).toBeGreaterThan(40000);
    expect(v.capacity).toBeLessThan(90000);
    expect(v.gates.length).toBeGreaterThanOrEqual(4);
    expect(new Set(v.gates).size).toBe(v.gates.length);
    expect(v.transit.length).toBeGreaterThanOrEqual(2);
    expect(v.timezone).toMatch(/^America\//);
  });

  it.each(VENUE_IDS)('%s transit links have positive throughput and walk times', (id) => {
    for (const t of VENUES[id].transit) {
      expect(t.peakThroughputPerMinute).toBeGreaterThan(0);
      expect(t.walkMinutes).toBeGreaterThan(0);
      expect(t.name.length).toBeGreaterThan(3);
    }
  });

  it('flags exactly one flagship venue (MetLife — hosts the final)', () => {
    const flagships = VENUE_IDS.filter((id) => VENUES[id].flagship);
    expect(flagships).toEqual(['metlife']);
  });

  it('getVenue returns undefined for unknown ids', () => {
    expect(getVenue('narnia-dome')).toBeUndefined();
  });
});
