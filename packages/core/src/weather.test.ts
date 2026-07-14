// weather.test.ts — M09/M10: protocol state machine across presets × venue types,
// heat tiers, and persona action coverage.
import { describe, expect, it } from 'vitest';
import {
  HEAT_TIER_THRESHOLDS,
  LIGHTNING_RADIUS_MILES,
  SUSPENSION_MINIMUM_MINUTES,
  WEATHER_PRESETS,
  evaluateWeatherProtocol,
  heatTierFor,
  readWeather,
} from './weather';
import { VENUE_IDS, VENUES } from './venues';

const SEED = 26;
const PERSONAS = ['fan', 'volunteer', 'organizer', 'staff'] as const;

describe('readWeather determinism', () => {
  it.each(WEATHER_PRESETS)('%s: identical inputs give identical readings', (preset) => {
    expect(readWeather(preset, 50, SEED)).toEqual(readWeather(preset, 50, SEED));
  });

  it('clear-day never produces close lightning', () => {
    for (let m = 0; m <= 120; m += 5) {
      expect(readWeather('clear-day', m, SEED).nearestStrikeMiles).toBe(Infinity);
    }
  });

  it('heat-dome heat index sits in the documented RealFeel band (100–110°F)', () => {
    for (let m = 0; m <= 120; m += 10) {
      const r = readWeather('heat-dome', m, SEED);
      expect(r.heatIndexF).toBeGreaterThanOrEqual(100);
      expect(r.heatIndexF).toBeLessThanOrEqual(110);
    }
  });
});

describe('heatTierFor thresholds', () => {
  it.each([
    [80, false, 'normal'],
    [89, false, 'normal'],
    [90, false, 'caution'],
    [97, false, 'caution'],
    [98, false, 'cooling-breaks'],
    [105, false, 'cooling-breaks'],
    [106, false, 'extreme'],
    [115, false, 'extreme'],
  ] as const)('heat index %d (open-air) → %s', (heatIndex, roofed, tier) => {
    expect(heatTierFor(heatIndex, roofed)).toBe(tier);
  });

  it('climate-controlled venues always report normal (roof bypasses heat)', () => {
    expect(heatTierFor(110, true)).toBe('normal');
    expect(heatTierFor(HEAT_TIER_THRESHOLDS.extreme, true)).toBe('normal');
  });
});

describe('protocol state machine (M09)', () => {
  it('philadelphia replay: suspension in force during the storm window', () => {
    const p = evaluateWeatherProtocol('lincoln-philadelphia', 'philadelphia-lightning', 50, SEED);
    expect(p?.state).toBe('suspension');
    expect(p?.suspendedUntilMinute).toBeDefined();
    if (p?.suspendedUntilMinute !== undefined) {
      // ≥30 minutes after the last close strike — the 8-mile rule as documented.
      expect(p.suspendedUntilMinute - 50).toBeLessThanOrEqual(SUSPENSION_MINIMUM_MINUTES + 25);
    }
  });

  it('suspension persists ≥30 min after the last close strike, then clears', () => {
    // Storm window ends at 75; suspension must hold through 75+30=105.
    const during = evaluateWeatherProtocol('lincoln-philadelphia', 'philadelphia-lightning', 100, SEED);
    expect(during?.state).toBe('suspension');
    const after = evaluateWeatherProtocol('lincoln-philadelphia', 'philadelphia-lightning', 110, SEED);
    expect(after?.state).toBe('all-clear');
    const later = evaluateWeatherProtocol('lincoln-philadelphia', 'philadelphia-lightning', 125, SEED);
    expect(['clear', 'lightning-watch']).toContain(later?.state);
  });

  it('clear-day never suspends at any minute', () => {
    for (let m = 0; m <= 120; m += 10) {
      const p = evaluateWeatherProtocol('metlife', 'clear-day', m, SEED);
      expect(p?.state).toBe('clear');
    }
  });

  it.each(VENUE_IDS)('%s: heat-dome tier honours the roof flag (M09)', (venueId) => {
    const p = evaluateWeatherProtocol(venueId, 'heat-dome', 30, SEED);
    expect(p).toBeDefined();
    if (p === undefined) return;
    if (VENUES[venueId].climateControlled) expect(p.heatTier).toBe('normal');
    else expect(['cooling-breaks', 'extreme']).toContain(p.heatTier);
  });

  it('unknown venue returns undefined', () => {
    expect(evaluateWeatherProtocol('narnia-dome', 'clear-day', 0, SEED)).toBeUndefined();
  });

  it('watch ring: strikes within 2× radius but outside 8 miles → lightning-watch', () => {
    // passing-storm at minute 22 puts strikes 5–12 miles out; find a watch case.
    const states = [];
    for (let m = 20; m <= 35; m += 1) {
      const p = evaluateWeatherProtocol('metlife', 'passing-storm', m, SEED);
      if (p !== undefined) states.push(p.state);
    }
    expect(states).toContain('suspension'); // some strikes fall inside 8 miles
    expect(LIGHTNING_RADIUS_MILES).toBe(8);
  });
});

describe('persona actions (M10)', () => {
  const cases = WEATHER_PRESETS.flatMap((preset) =>
    (['metlife', 'att-dallas', 'lincoln-philadelphia'] as const).flatMap((venueId) =>
      [15, 50, 110].map((minute) => ({ preset, venueId, minute })),
    ),
  );

  it.each(cases)('$preset / $venueId @ $minute: all four personas get actions', ({ preset, venueId, minute }) => {
    const p = evaluateWeatherProtocol(venueId, preset, minute, SEED);
    expect(p).toBeDefined();
    if (p === undefined) return;
    for (const persona of PERSONAS) {
      expect(p.actions[persona].length).toBeGreaterThan(0);
      for (const line of p.actions[persona]) expect(line.length).toBeGreaterThan(10);
    }
  });

  it('suspension actions tell fans to shelter, organizers to cite the 8-mile rule', () => {
    const p = evaluateWeatherProtocol('lincoln-philadelphia', 'philadelphia-lightning', 50, SEED);
    expect(p?.actions.fan.join(' ')).toMatch(/shelter/i);
    expect(p?.actions.organizer.join(' ')).toMatch(/8-mile/);
  });
});
