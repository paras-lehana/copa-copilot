// gamification.test.ts — M14/M15: mission validation across types × claim states,
// point-formula single-sourcing, levels and anti-minting clamps.
import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  MAX_RESTORABLE_POINTS,
  MISSION_IDS,
  MISSIONS,
  clampRestoredPoints,
  levelForPoints,
  pointsForCo2,
  pointsForCongestionAvoided,
  validateCompletion,
} from './gamification';
import { commuteFootprint } from './sustainability';

describe('point formulas are THE source (M15)', () => {
  it.each([
    [0, 0],
    [0.5, 5],
    [1.55, 16], // the documented regression case: engine says 16, never hand-write 15
    [2.7, 27],
  ] as const)('pointsForCo2(%f) = %d', (kg, points) => {
    expect(pointsForCo2(kg)).toBe(points);
  });

  it.each([
    [0, 0],
    [6, 12],
    [12, 24],
    [30, 60],
  ] as const)('pointsForCongestionAvoided(%d) = %d', (minutes, points) => {
    expect(pointsForCongestionAvoided(minutes)).toBe(points);
  });

  it('green-footprint award = base + pointsForCo2(engine saving) — no magic numbers', () => {
    const distanceKm = 15;
    const saving = commuteFootprint('rail', distanceKm).kgCo2eSavedVsRideshare;
    const r = validateCompletion({
      missionId: 'green-footprint',
      minute: -60,
      commuteMode: 'rail',
      commuteDistanceKm: distanceKm,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.points).toBe(MISSIONS['green-footprint'].basePoints + pointsForCo2(saving));
    expect(r.value.reason).toContain(`${saving} kg CO2e`);
  });
});

describe('mission catalog', () => {
  it('has five operational missions, each bound to an engine metric', () => {
    expect(MISSION_IDS).toHaveLength(5);
    for (const id of MISSION_IDS) {
      expect(MISSIONS[id].basePoints).toBeGreaterThan(0);
      expect(MISSIONS[id].metric.length).toBeGreaterThan(0);
      expect(MISSIONS[id].description.length).toBeGreaterThan(20);
    }
  });
});

describe('completion validation across types × claim states (M14)', () => {
  const window = { fromMinute: -120, toMinute: -75 };

  it('beat-the-rush: inside window passes, outside fails, missing window fails', () => {
    const okClaim = validateCompletion({
      missionId: 'beat-the-rush',
      minute: -100,
      arrivalWindow: window,
    });
    expect(okClaim.ok).toBe(true);
    const late = validateCompletion({ missionId: 'beat-the-rush', minute: -30, arrivalWindow: window });
    expect(!late.ok && late.error.code).toBe('MISSION_REJECTED');
    const missing = validateCompletion({ missionId: 'beat-the-rush', minute: -100 });
    expect(!missing.ok && missing.error.code).toBe('MISSION_REJECTED');
  });

  it('green-footprint: rideshare rejected, implausible distance rejected, walk passes', () => {
    const rideshare = validateCompletion({
      missionId: 'green-footprint',
      minute: -60,
      commuteMode: 'rideshare',
      commuteDistanceKm: 10,
    });
    expect(!rideshare.ok && rideshare.error.code).toBe('MISSION_REJECTED');
    const tooFar = validateCompletion({
      missionId: 'green-footprint',
      minute: -60,
      commuteMode: 'rail',
      commuteDistanceKm: 500,
    });
    expect(!tooFar.ok && tooFar.error.code).toBe('MISSION_REJECTED');
    const walk = validateCompletion({
      missionId: 'green-footprint',
      minute: -60,
      commuteMode: 'walk',
      commuteDistanceKm: 3,
    });
    expect(walk.ok).toBe(true);
  });

  it('smart-exit: within ±5 of the advice passes; drifting misses; no advice fails', () => {
    const followed = validateCompletion({ missionId: 'smart-exit', minute: 84, advisedLeaveMinute: 82 });
    expect(followed.ok).toBe(true);
    const drifted = validateCompletion({ missionId: 'smart-exit', minute: 100, advisedLeaveMinute: 82 });
    expect(!drifted.ok && drifted.error.code).toBe('MISSION_REJECTED');
    const noAdvice = validateCompletion({ missionId: 'smart-exit', minute: 84 });
    expect(!noAdvice.ok && noAdvice.error.code).toBe('MISSION_REJECTED');
  });

  it('refill-run: only counts under an active heat protocol', () => {
    const hot = validateCompletion({ missionId: 'refill-run', minute: 50, heatProtocolActive: true });
    expect(hot.ok).toBe(true);
    const mild = validateCompletion({ missionId: 'refill-run', minute: 50, heatProtocolActive: false });
    expect(!mild.ok && mild.error.code).toBe('MISSION_REJECTED');
  });

  it('route-follow: matchday only', () => {
    const matchday = validateCompletion({ missionId: 'route-follow', minute: 30 });
    expect(matchday.ok).toBe(true);
    const preGates = validateCompletion({ missionId: 'route-follow', minute: -200 });
    expect(!preGates.ok && preGates.error.code).toBe('MISSION_REJECTED');
  });

  it.each(MISSION_IDS)('%s awards carry a human-readable reason', (missionId) => {
    // Build a valid claim per mission type.
    const claims = {
      'beat-the-rush': { missionId, minute: -100, arrivalWindow: { fromMinute: -120, toMinute: -75 } },
      'green-footprint': { missionId, minute: -60, commuteMode: 'rail', commuteDistanceKm: 10 },
      'smart-exit': { missionId, minute: 82, advisedLeaveMinute: 82 },
      'refill-run': { missionId, minute: 50, heatProtocolActive: true },
      'route-follow': { missionId, minute: 30 },
    } as const;
    const r = validateCompletion(claims[missionId]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reason.length).toBeGreaterThan(10);
  });
});

describe('levels', () => {
  it('curve is strictly increasing', () => {
    for (let i = 1; i < LEVELS.length; i += 1) {
      const current = LEVELS[i];
      const previous = LEVELS[i - 1];
      if (current === undefined || previous === undefined) throw new Error('missing level');
      expect(current.minPoints).toBeGreaterThan(previous.minPoints);
      expect(current.level).toBe(previous.level + 1);
    }
  });

  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [250, 3],
    [1000, 6],
    [99999, 8],
  ] as const)('levelForPoints(%d) = %d', (points, level) => {
    expect(levelForPoints(points)).toBe(level);
  });
});

describe('anti-minting clamp', () => {
  it.each([
    [-50, 0],
    [0, 0],
    [500, 500],
    [MAX_RESTORABLE_POINTS, MAX_RESTORABLE_POINTS],
    [999999, MAX_RESTORABLE_POINTS],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ] as const)('clampRestoredPoints(%d) = %d', (claimed, expected) => {
    expect(clampRestoredPoints(claimed)).toBe(expected);
  });
});
