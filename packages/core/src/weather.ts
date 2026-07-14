// weather.ts — FIFA weather-protocol engine (lightning + heat).
// Boundary: encodes the tournament's documented rules — automatic ≥30-minute
// suspension when lightning strikes within 8 miles of an open-air stadium, and
// tiered heat protocols with mandatory cooling breaks — as a deterministic state
// machine over a seeded weather feed. Roofed venues bypass heat, not lightning
// ingress/egress handling.

import { createRng, deriveSeed, range } from './prng';
import { getVenue } from './venues';

/** Protocol states, in escalation order. */
export type WeatherProtocolState = 'clear' | 'lightning-watch' | 'suspension' | 'all-clear';

/** Heat tiers from heat-index (°F), per FIFA's cooling-break protocol. */
export type HeatTier = 'normal' | 'caution' | 'cooling-breaks' | 'extreme';

/** The rule constants — documented so tests and docs quote one source. */
export const LIGHTNING_RADIUS_MILES = 8;
export const SUSPENSION_MINIMUM_MINUTES = 30;
export const HEAT_TIER_THRESHOLDS: Record<Exclude<HeatTier, 'normal'>, number> = {
  caution: 90,
  'cooling-breaks': 98,
  extreme: 106,
};

/** Personas the protocol issues instructions for. */
export type ProtocolPersona = 'fan' | 'volunteer' | 'organizer' | 'staff';

/** A deterministic weather reading at one minute. */
export interface WeatherReading {
  readonly minute: number;
  /** Distance of the nearest lightning strike in miles (Infinity = none). */
  readonly nearestStrikeMiles: number;
  /** Heat index in °F. */
  readonly heatIndexF: number;
}

/** Full protocol evaluation for a venue at one minute. */
export interface WeatherProtocol {
  readonly venueId: string;
  readonly minute: number;
  readonly state: WeatherProtocolState;
  readonly heatTier: HeatTier;
  readonly reading: WeatherReading;
  /** Suspension end minute when state === 'suspension'. */
  readonly suspendedUntilMinute?: number;
  /** Persona-specific action lines, engine-generated. */
  readonly actions: Readonly<Record<ProtocolPersona, readonly string[]>>;
}

/** Named weather presets replaying documented 2026 incidents. */
export type WeatherPresetId = 'clear-day' | 'philadelphia-lightning' | 'heat-dome' | 'passing-storm';

/** All presets, for pickers and matrix tests. */
export const WEATHER_PRESETS: readonly WeatherPresetId[] = [
  'clear-day',
  'philadelphia-lightning',
  'heat-dome',
  'passing-storm',
];

/**
 * Deterministic weather feed. Presets shape the pattern; the seed adds stable
 * variation so different matchdays differ reproducibly.
 */
export function readWeather(
  preset: WeatherPresetId,
  minute: number,
  seed: number,
): WeatherReading {
  const rng = createRng(deriveSeed(seed, `weather:${preset}:${minute}`));
  switch (preset) {
    case 'clear-day':
      return { minute, nearestStrikeMiles: Infinity, heatIndexF: Math.round(range(rng, 78, 86)) };
    case 'philadelphia-lightning': {
      // Replay of June 22: strikes close in around halftime (14 strikes within 8 miles).
      const inStormWindow = minute >= 40 && minute <= 75;
      const strike = inStormWindow ? range(rng, 2.5, 7.5) : range(rng, 15, 40);
      return { minute, nearestStrikeMiles: Math.round(strike * 10) / 10, heatIndexF: Math.round(range(rng, 84, 92)) };
    }
    case 'heat-dome':
      // Replay of the early-July heat dome: RealFeel 100–110 °F.
      return { minute, nearestStrikeMiles: Infinity, heatIndexF: Math.round(range(rng, 100, 110)) };
    case 'passing-storm': {
      const near = minute >= 20 && minute <= 35;
      const strike = near ? range(rng, 5, 12) : range(rng, 20, 60);
      return { minute, nearestStrikeMiles: Math.round(strike * 10) / 10, heatIndexF: Math.round(range(rng, 82, 94)) };
    }
  }
}

/** Heat tier from heat index (roofed venues report 'normal' — climate-controlled). */
export function heatTierFor(heatIndexF: number, climateControlled: boolean): HeatTier {
  if (climateControlled) return 'normal';
  if (heatIndexF >= HEAT_TIER_THRESHOLDS.extreme) return 'extreme';
  if (heatIndexF >= HEAT_TIER_THRESHOLDS['cooling-breaks']) return 'cooling-breaks';
  if (heatIndexF >= HEAT_TIER_THRESHOLDS.caution) return 'caution';
  return 'normal';
}

/** Action templates per state/tier and persona — constants-as-data. */
const STATE_ACTIONS: Record<WeatherProtocolState, Record<ProtocolPersona, readonly string[]>> = {
  clear: {
    fan: ['No weather restrictions. Enjoy the match.'],
    volunteer: ['Standard posts. No weather actions required.'],
    organizer: ['Protocol clear. Monitor the lightning feed each segment.'],
    staff: ['Facilities normal. Hydration stations at standard staffing.'],
  },
  'lightning-watch': {
    fan: ['Lightning detected in the area. Stay near covered concourses.'],
    volunteer: ['Pre-position at concourse entries. Prepare shelter messaging.'],
    organizer: ['Strikes inside the watch ring. Brief PA and stand by to suspend.'],
    staff: ['Open all covered areas. Check lift capacity for a shelter push.'],
  },
  suspension: {
    fan: ['Match suspended — shelter in place inside the concourse. Do not exit.'],
    volunteer: ['Move fans off open sections into concourses. Hold exit gates.'],
    organizer: ['Mandatory suspension in force (8-mile rule). Clock restarts on the last strike.'],
    staff: ['Maximize covered capacity. Monitor density — weather-hold pattern expected.'],
  },
  'all-clear': {
    fan: ['All clear. Play resumes shortly — return to your section.'],
    volunteer: ['Guide fans back to sections. Report blockages.'],
    organizer: ['Resume sequence: pitch inspection, then restart announcement.'],
    staff: ['Restore normal circulation. Restock hydration after the surge.'],
  },
};

const HEAT_ACTIONS: Record<HeatTier, Record<ProtocolPersona, readonly string[]>> = {
  normal: { fan: [], volunteer: [], organizer: [], staff: [] },
  caution: {
    fan: ['Heat caution: drink water each half. Hydration stations are marked on the map.'],
    volunteer: ['Watch queues for heat distress. Direct fans to hydration points.'],
    organizer: ['Heat caution tier. Confirm misting fans and water stock.'],
    staff: ['Double-check hydration station supply levels.'],
  },
  'cooling-breaks': {
    fan: ['Cooling breaks are in effect each half. Use them to hydrate.'],
    volunteer: ['Announce cooling breaks. Rotate your own shade breaks too.'],
    organizer: ['Mandatory cooling breaks each half. Coordinate with match officials.'],
    staff: ['Open additional shaded areas. Increase first-aid readiness.'],
  },
  extreme: {
    fan: ['Extreme heat. Minimize sun exposure; seek shade and drink water now.'],
    volunteer: ['Extreme heat posture: shorten outdoor shifts, escalate distress fast.'],
    organizer: ['Extreme tier: consider delayed kickoff and extra cooling measures.'],
    staff: ['Deploy misting fans at gates. First aid on heat-emergency footing.'],
  },
};

function mergeActions(
  state: WeatherProtocolState,
  tier: HeatTier,
): Record<ProtocolPersona, readonly string[]> {
  const personas: readonly ProtocolPersona[] = ['fan', 'volunteer', 'organizer', 'staff'];
  const merged = {} as Record<ProtocolPersona, readonly string[]>;
  for (const p of personas) {
    merged[p] = [...STATE_ACTIONS[state][p], ...HEAT_ACTIONS[tier][p]];
  }
  return merged;
}

/**
 * Evaluate the weather protocol for a venue at a minute.
 *
 * State logic: a strike within 8 miles at or before this minute puts the match in
 * 'suspension' until 30 minutes after the LAST close strike; 'lightning-watch'
 * covers strikes within twice the radius; a completed suspension reads 'all-clear'
 * for the following 10 minutes.
 *
 * @example
 * const p = evaluateWeatherProtocol('lincoln-philadelphia', 'philadelphia-lightning', 50, 26);
 * p?.state; // 'suspension' — the June 22 halftime suspension, replayed
 */
export function evaluateWeatherProtocol(
  venueId: string,
  preset: WeatherPresetId,
  minute: number,
  seed: number,
): WeatherProtocol | undefined {
  const venue = getVenue(venueId);
  if (venue === undefined) return undefined;
  const reading = readWeather(preset, minute, seed);

  // Find the last close strike up to this minute (scan the deterministic feed).
  let lastCloseStrike = -Infinity;
  for (let m = Math.max(0, minute - 120); m <= minute; m += 1) {
    const r = readWeather(preset, m, seed);
    if (r.nearestStrikeMiles <= LIGHTNING_RADIUS_MILES) lastCloseStrike = m;
  }

  let state: WeatherProtocolState = 'clear';
  let suspendedUntilMinute: number | undefined;
  if (lastCloseStrike > -Infinity) {
    const suspensionEnd = lastCloseStrike + SUSPENSION_MINIMUM_MINUTES;
    if (minute <= suspensionEnd) {
      state = 'suspension';
      suspendedUntilMinute = suspensionEnd;
    } else if (minute <= suspensionEnd + 10) {
      state = 'all-clear';
    }
  }
  if (state === 'clear' && reading.nearestStrikeMiles <= LIGHTNING_RADIUS_MILES * 2) {
    state = 'lightning-watch';
  }

  const heatTier = heatTierFor(reading.heatIndexF, venue.climateControlled);
  const base: Omit<WeatherProtocol, 'suspendedUntilMinute'> = {
    venueId: venue.id,
    minute,
    state,
    heatTier,
    reading,
    actions: mergeActions(state, heatTier),
  };
  return suspendedUntilMinute === undefined ? base : { ...base, suspendedUntilMinute };
}
