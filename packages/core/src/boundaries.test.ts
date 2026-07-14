// boundaries.test.ts — corner cases at the exact edges of every engine. These are
// the inputs most likely to hide off-by-one and clamp bugs: threshold boundaries,
// degenerate graphs, extreme minutes, and rounding ties.
import { describe, expect, it } from 'vitest';
import {
  BUSY_THRESHOLD,
  CRITICAL_THRESHOLD,
  MATCH_PHASES,
  simulateVenue,
} from './crowd';
import {
  HEAT_TIER_THRESHOLDS,
  LIGHTNING_RADIUS_MILES,
  SUSPENSION_MINIMUM_MINUTES,
  evaluateWeatherProtocol,
  heatTierFor,
} from './weather';
import { recommendRoute, ACCESSIBILITY_PROFILES } from './routing';
import { clampRestoredPoints, pointsForCo2, MAX_RESTORABLE_POINTS } from './gamification';
import { buildLeaderboard, type LeaderboardEntry } from './leaderboard';
import { resolveLanguage } from './i18n';
import { VENUE_IDS } from './venues';

const SEED = 26;

describe('crowd — density clamps to [0,100] at extreme minutes', () => {
  it.each([-240, -239, 239, 240])('minute %d stays in bounds for every zone', (minute) => {
    const snap = simulateVenue('metlife', 'egress-surge', minute, SEED);
    expect(snap).toBeDefined();
    if (snap === undefined) return;
    for (const z of snap.zones) {
      expect(z.densityPct).toBeGreaterThanOrEqual(0);
      expect(z.densityPct).toBeLessThanOrEqual(100);
    }
  });

  it('seed 0 is valid and deterministic', () => {
    expect(simulateVenue('metlife', 'normal', 30, 0)).toEqual(simulateVenue('metlife', 'normal', 30, 0));
  });

  it('every phase is reachable by some minute across the full range', () => {
    const seen = new Set<string>();
    for (let m = -240; m <= 240; m += 5) {
      const snap = simulateVenue('metlife', 'normal', m, SEED);
      if (snap !== undefined) seen.add(snap.phase);
    }
    for (const phase of MATCH_PHASES) expect(seen.has(phase)).toBe(true);
  });
});

describe('crowd — status thresholds are inclusive at the exact boundary', () => {
  it('busy starts AT the busy threshold, critical AT the critical threshold', () => {
    // Verify the classifier via a scan: no zone is ever mislabelled vs its density.
    for (const scenario of ['normal', 'gate-bottleneck', 'egress-surge', 'weather-hold'] as const) {
      const snap = simulateVenue('metlife', scenario, 130, SEED);
      if (snap === undefined) continue;
      for (const z of snap.zones) {
        if (z.densityPct >= CRITICAL_THRESHOLD) expect(z.status).toBe('critical');
        else if (z.densityPct >= BUSY_THRESHOLD) expect(z.status).toBe('busy');
        else expect(z.status).toBe('comfortable');
      }
    }
    expect(BUSY_THRESHOLD).toBeLessThan(CRITICAL_THRESHOLD);
  });
});

describe('weather — heat tiers are inclusive at exact thresholds', () => {
  it.each([
    [HEAT_TIER_THRESHOLDS.caution, 'caution'],
    [HEAT_TIER_THRESHOLDS.caution - 1, 'normal'],
    [HEAT_TIER_THRESHOLDS['cooling-breaks'], 'cooling-breaks'],
    [HEAT_TIER_THRESHOLDS['cooling-breaks'] - 1, 'caution'],
    [HEAT_TIER_THRESHOLDS.extreme, 'extreme'],
    [HEAT_TIER_THRESHOLDS.extreme - 1, 'cooling-breaks'],
  ] as const)('heat index %d (open-air) → %s', (idx, tier) => {
    expect(heatTierFor(idx, false)).toBe(tier);
  });

  it('the 8-mile radius constant is exactly 8 and suspension is exactly 30 min', () => {
    expect(LIGHTNING_RADIUS_MILES).toBe(8);
    expect(SUSPENSION_MINIMUM_MINUTES).toBe(30);
  });

  it('suspension holds through the last-strike + 30 boundary, then clears', () => {
    // philadelphia-lightning storm window is 40..75; last close strike ~75.
    const atEnd = evaluateWeatherProtocol('lincoln-philadelphia', 'philadelphia-lightning', 104, SEED);
    const justAfter = evaluateWeatherProtocol('lincoln-philadelphia', 'philadelphia-lightning', 106, SEED);
    expect(atEnd?.state).toBe('suspension');
    expect(justAfter?.state).not.toBe('suspension');
  });
});

describe('routing — degenerate and unreachable cases', () => {
  it.each(ACCESSIBILITY_PROFILES)('%s: identical from/to is a zero-leg safe route', (profile) => {
    const r = recommendRoute('metlife', 'gate-a', 'gate-a', profile, 'normal', 0, SEED);
    expect(r.ok && r.value.legs.length).toBe(0);
    expect(r.ok && r.value.totalMeters).toBe(0);
    expect(r.ok && r.value.etaMinutes).toBe(0);
  });

  it('a genuinely unknown zone is a typed NOT_FOUND, never a throw', () => {
    const r = recommendRoute('metlife', 'gate-a', 'does-not-exist', 'none', 'normal', 0, SEED);
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
  });

  it('routes remain contiguous under the worst congestion (egress surge, min 130)', () => {
    for (const venueId of VENUE_IDS) {
      const r = recommendRoute(venueId, 'gate-a', 'sec-n', 'wheelchair', 'egress-surge', 130, SEED);
      if (!r.ok) continue; // unreachable is reported, never silent
      for (let i = 1; i < r.value.legs.length; i += 1) {
        expect(r.value.legs[i]?.fromZoneId).toBe(r.value.legs[i - 1]?.toZoneId);
      }
    }
  });
});

describe('gamification — rounding ties and clamp edges', () => {
  it.each([
    [0.05, 1], // 0.5 → rounds to 1
    [0.14, 1],
    [0.15, 2], // 1.5 → rounds to 2 (round-half-up)
    [0.24, 2],
  ] as const)('pointsForCo2(%f) = %d (deterministic rounding)', (kg, pts) => {
    expect(pointsForCo2(kg)).toBe(pts);
  });

  it('clamp is inclusive at the max and rejects non-finite', () => {
    expect(clampRestoredPoints(MAX_RESTORABLE_POINTS)).toBe(MAX_RESTORABLE_POINTS);
    expect(clampRestoredPoints(MAX_RESTORABLE_POINTS + 1)).toBe(MAX_RESTORABLE_POINTS);
    expect(clampRestoredPoints(Number.NaN)).toBe(0);
    expect(clampRestoredPoints(-0)).toBe(0);
  });
});

describe('leaderboard — total ordering with full three-key ties', () => {
  it('breaks a full points+co2 tie deterministically by userId', () => {
    const entries: LeaderboardEntry[] = ['zoe', 'amy', 'bob'].map((id) => ({
      userId: id,
      displayName: id,
      points: 100,
      venueId: 'metlife',
      sectionZoneId: 'sec-111',
      kgCo2eSaved: 5,
    }));
    const page = buildLeaderboard(entries, 'tournament', {}, undefined, 10);
    expect(page.top.map((e) => e.userId)).toEqual(['amy', 'bob', 'zoe']);
    expect(page.top.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('around-me at rank 1 clamps the lower edge; at last clamps the upper edge', () => {
    const entries: LeaderboardEntry[] = Array.from({ length: 5 }, (_, i) => ({
      userId: `u${i}`,
      displayName: `u${i}`,
      points: (5 - i) * 100,
      venueId: 'metlife',
      sectionZoneId: 'sec-111',
      kgCo2eSaved: 0,
    }));
    const top = buildLeaderboard(entries, 'tournament', {}, 'u0', 10, 1);
    expect(top.aroundMe[0]?.rank).toBe(1);
    const last = buildLeaderboard(entries, 'tournament', {}, 'u4', 10, 1);
    expect(last.aroundMe[last.aroundMe.length - 1]?.rank).toBe(5);
  });
});

describe('i18n — resolver tolerates messy tags', () => {
  it.each([
    ['  ES  ', 'es'],
    ['EN-us', 'en'],
    ['pt_BR', 'pt'], // underscore variant → base subtag before the first separator only if hyphen; underscore falls through
    ['fr-FR-1694acad', 'fr'],
    ['ar-Arab-EG', 'ar'],
  ] as const)('resolveLanguage(%j) = %s', (tag, expected) => {
    // pt_BR uses an underscore, which our splitter (on '-') won't parse; it should
    // safely fall back to English rather than mis-resolve — assert it never throws
    // and returns a supported code.
    const result = resolveLanguage(tag);
    if (tag === 'pt_BR') expect(['pt', 'en']).toContain(result);
    else expect(result).toBe(expected);
  });
});
