// incidents.test.ts — M11: lifecycle exhaustiveness + triage ordering across
// categories × severities × density states.
import { describe, expect, it } from 'vitest';
import { simulateVenue } from './crowd';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  type Incident,
  advanceIncident,
  seedIncidents,
  triageQueue,
  triageScore,
} from './incidents';

const SEED = 26;

function makeIncident(overrides: Partial<Incident>): Incident {
  return {
    id: 'inc-x',
    venueId: 'metlife',
    zoneId: 'concourse-n',
    category: 'crowd',
    severity: 'medium',
    summary: 'Test incident',
    status: 'reported',
    reportedAtMinute: 30,
    ...overrides,
  };
}

describe('lifecycle transitions', () => {
  it.each([
    ['reported', 'triaged'],
    ['triaged', 'dispatched'],
    ['dispatched', 'resolved'],
  ] as const)('%s advances to %s', (from, to) => {
    const r = advanceIncident(makeIncident({ status: from }));
    expect(r.ok && r.value.status).toBe(to);
  });

  it('resolved is terminal — advancing is a typed error', () => {
    const r = advanceIncident(makeIncident({ status: 'resolved' }));
    expect(!r.ok && r.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('triage scoring across categories × severities (M11)', () => {
  const snap = simulateVenue('metlife', 'normal', 50, SEED);

  const cases = INCIDENT_CATEGORIES.flatMap((category) =>
    INCIDENT_SEVERITIES.map((severity) => ({ category, severity })),
  );

  it.each(cases)('$category/$severity yields a positive finite score', ({ category, severity }) => {
    const score = triageScore(makeIncident({ category, severity }), snap);
    expect(score).toBeGreaterThan(0);
    expect(Number.isFinite(score)).toBe(true);
  });

  it('severity strictly escalates within a category', () => {
    const scores = INCIDENT_SEVERITIES.map((severity) =>
      triageScore(makeIncident({ severity }), snap),
    );
    for (let i = 1; i < scores.length; i += 1) {
      const current = scores[i];
      const previous = scores[i - 1];
      if (current === undefined || previous === undefined) throw new Error('missing score');
      expect(current).toBeGreaterThan(previous);
    }
  });

  it('medical outranks facility at equal severity', () => {
    const medical = triageScore(makeIncident({ category: 'medical', severity: 'high' }), snap);
    const facility = triageScore(makeIncident({ category: 'facility', severity: 'high' }), snap);
    expect(medical).toBeGreaterThan(facility);
  });

  it('denser zones raise the score', () => {
    const surge = simulateVenue('metlife', 'egress-surge', 120, SEED);
    const calm = simulateVenue('metlife', 'normal', 20, SEED);
    const incident = makeIncident({ zoneId: 'transit-rail' });
    expect(triageScore(incident, surge)).toBeGreaterThan(triageScore(incident, calm));
  });

  it('missing snapshot falls back to a neutral density, not a crash', () => {
    expect(triageScore(makeIncident({}), undefined)).toBeGreaterThan(0);
  });
});

describe('triageQueue', () => {
  const snap = simulateVenue('metlife', 'normal', 50, SEED);

  it('orders highest score first and excludes resolved', () => {
    const incidents: Incident[] = [
      makeIncident({ id: 'low', category: 'facility', severity: 'low' }),
      makeIncident({ id: 'crit', category: 'medical', severity: 'critical' }),
      makeIncident({ id: 'done', category: 'medical', severity: 'critical', status: 'resolved' }),
      makeIncident({ id: 'mid', category: 'crowd', severity: 'high' }),
    ];
    const queue = triageQueue(incidents, snap);
    expect(queue.map((i) => i.id)).toEqual(['crit', 'mid', 'low']);
  });

  it('breaks ties by earlier report minute, then id — fully deterministic', () => {
    const incidents: Incident[] = [
      makeIncident({ id: 'b', reportedAtMinute: 30 }),
      makeIncident({ id: 'a', reportedAtMinute: 30 }),
      makeIncident({ id: 'c', reportedAtMinute: 10 }),
    ];
    const queue = triageQueue(incidents, snap);
    expect(queue.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('is stable across repeated calls', () => {
    const incidents = seedIncidents('metlife', 40);
    expect(triageQueue(incidents, snap)).toEqual(triageQueue(incidents, snap));
  });
});

describe('seedIncidents', () => {
  it('parameterises timestamps — never fossilised dates', () => {
    const early = seedIncidents('metlife', 10);
    const late = seedIncidents('metlife', 90);
    expect(early[0]?.reportedAtMinute).toBe(10);
    expect(late[0]?.reportedAtMinute).toBe(90);
  });

  it('spans category and status variety for the demo queue', () => {
    const seeded = seedIncidents('metlife', 40);
    expect(new Set(seeded.map((i) => i.category)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(seeded.map((i) => i.status)).size).toBeGreaterThanOrEqual(3);
  });
});
