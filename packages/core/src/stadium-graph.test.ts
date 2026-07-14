// stadium-graph.test.ts — M32: structural invariants for every venue graph.
import { describe, expect, it } from 'vitest';
import { buildStadiumGraph } from './stadium-graph';
import { VENUES, VENUE_IDS } from './venues';

describe('graph invariants (M32)', () => {
  it.each(VENUE_IDS)('%s: every edge endpoint is a declared zone', (venueId) => {
    const g = buildStadiumGraph(venueId);
    expect(g).toBeDefined();
    if (g === undefined) return;
    const ids = new Set(g.zones.map((z) => z.id));
    for (const e of g.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });

  it.each(VENUE_IDS)('%s: edges are stored bidirectionally', (venueId) => {
    const g = buildStadiumGraph(venueId);
    if (g === undefined) throw new Error('graph missing');
    for (const e of g.edges) {
      const reverse = g.edges.find((r) => r.from === e.to && r.to === e.from);
      expect(reverse, `missing reverse of ${e.from}→${e.to}`).toBeDefined();
    }
  });

  it.each(VENUE_IDS)('%s: graph is fully connected', (venueId) => {
    const g = buildStadiumGraph(venueId);
    if (g === undefined) throw new Error('graph missing');
    const first = g.zones[0];
    if (first === undefined) throw new Error('empty graph');
    const seen = new Set<string>([first.id]);
    const queue = [first.id];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const e of g.edges) {
        if (e.from === current && !seen.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
    }
    expect(seen.size).toBe(g.zones.length);
  });

  it.each(VENUE_IDS)('%s: every section is reachable step-free from a gate', (venueId) => {
    const g = buildStadiumGraph(venueId);
    if (g === undefined) throw new Error('graph missing');
    const gates = g.zones.filter((z) => z.kind === 'gate').map((z) => z.id);
    const sections = g.zones.filter((z) => z.kind === 'section').map((z) => z.id);
    // BFS over step-free edges only.
    const seen = new Set<string>(gates);
    const queue = [...gates];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const e of g.edges) {
        if (e.from === current && e.stepFree && !seen.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
    }
    for (const s of sections) {
      expect(seen.has(s), `section ${s} unreachable step-free in ${venueId}`).toBe(true);
    }
  });

  it.each(VENUE_IDS)('%s: declares gates matching the venue registry', (venueId) => {
    const g = buildStadiumGraph(venueId);
    if (g === undefined) throw new Error('graph missing');
    const gateZones = g.zones.filter((z) => z.kind === 'gate').map((z) => z.id);
    expect(gateZones.sort()).toEqual([...VENUES[venueId].gates].sort());
  });

  it('memoizes: repeated builds return the same object', () => {
    expect(buildStadiumGraph('metlife')).toBe(buildStadiumGraph('metlife'));
  });

  it('returns undefined for unknown venues', () => {
    expect(buildStadiumGraph('narnia-dome')).toBeUndefined();
  });

  it('metlife flagship graph models amenities the assistant needs', () => {
    const g = buildStadiumGraph('metlife');
    if (g === undefined) throw new Error('graph missing');
    const kinds = new Set(g.zones.map((z) => z.kind));
    for (const required of [
      'gate',
      'concourse',
      'section',
      'food-court',
      'hydration',
      'accessible-facility',
      'prayer-room',
      'first-aid',
      'transit-hub',
    ] as const) {
      expect(kinds.has(required), `metlife missing ${required}`).toBe(true);
    }
  });
});
