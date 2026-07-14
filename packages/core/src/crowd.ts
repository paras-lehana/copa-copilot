// crowd.ts — the deterministic crowd, queue and transit-load simulation.
// Boundary: time (minutes relative to kickoff) and seed are ALWAYS parameters — no
// clocks, no Math.random(). The same (venue, scenario, minute, seed) tuple returns an
// identical snapshot forever, which is what makes every UI number test-assertable.

import { createRng, deriveSeed, range } from './prng';
import { type StadiumGraph, buildStadiumGraph } from './stadium-graph';
import { type TransitLink, type VenueId, type ZoneKind, getVenue } from './venues';

/** Where the matchday is, in minutes relative to kickoff. */
export type MatchPhase =
  | 'pre-gates'
  | 'ingress'
  | 'first-half'
  | 'halftime'
  | 'second-half'
  | 'final-whistle'
  | 'egress';

/** Named demo scenarios — the two replay real, documented 2026 incidents. */
export type ScenarioId = 'normal' | 'gate-bottleneck' | 'egress-surge' | 'weather-hold';

/** All scenarios, for UI pickers and matrix tests. */
export const SCENARIOS: readonly ScenarioId[] = [
  'normal',
  'gate-bottleneck',
  'egress-surge',
  'weather-hold',
];

/** Three-tier zone status with documented thresholds. */
export type ZoneStatus = 'comfortable' | 'busy' | 'critical';

/** densityPct >= CRITICAL_THRESHOLD → 'critical'; >= BUSY_THRESHOLD → 'busy'. */
export const BUSY_THRESHOLD = 55;
export const CRITICAL_THRESHOLD = 85;

/** Simulated crowd state for one zone at one minute. */
export interface ZoneCrowd {
  readonly zoneId: string;
  readonly name: string;
  readonly kind: ZoneKind;
  readonly densityPct: number;
  readonly status: ZoneStatus;
  /** Minutes of queueing at service points (gates, food, hydration); 0 elsewhere. */
  readonly queueMinutes: number;
}

/** Simulated load on one transit link at one minute. */
export interface TransitLoad {
  readonly name: string;
  readonly mode: TransitLink['mode'];
  readonly utilizationPct: number;
  readonly waitMinutes: number;
  readonly status: ZoneStatus;
}

/** A full venue snapshot at one minute. */
export interface CrowdSnapshot {
  readonly venueId: VenueId;
  readonly minute: number;
  readonly phase: MatchPhase;
  readonly scenario: ScenarioId;
  readonly zones: readonly ZoneCrowd[];
  readonly transit: readonly TransitLoad[];
}

/** All phases in chronological order, for matrix tests and phase pickers. */
export const MATCH_PHASES: readonly MatchPhase[] = [
  'pre-gates',
  'ingress',
  'first-half',
  'halftime',
  'second-half',
  'final-whistle',
  'egress',
];

/**
 * Map a minute (relative to kickoff; negative = before) to a match phase.
 *
 * @example
 * phaseForMinute(-30); // 'ingress'
 * phaseForMinute(50);  // 'halftime'
 * phaseForMinute(120); // 'egress'
 */
export function phaseForMinute(minute: number): MatchPhase {
  if (minute < -120) return 'pre-gates';
  if (minute < 0) return 'ingress';
  if (minute < 45) return 'first-half';
  if (minute < 60) return 'halftime';
  if (minute < 105) return 'second-half';
  if (minute < 115) return 'final-whistle';
  return 'egress';
}

/** Base occupancy fraction by zone kind and phase (constants-as-data, no branching). */
const BASE_OCCUPANCY: Record<ZoneKind, Record<MatchPhase, number>> = {
  gate: {
    'pre-gates': 0.05, ingress: 0.85, 'first-half': 0.2, halftime: 0.12,
    'second-half': 0.1, 'final-whistle': 0.5, egress: 0.95,
  },
  concourse: {
    'pre-gates': 0.05, ingress: 0.6, 'first-half': 0.3, halftime: 0.9,
    'second-half': 0.32, 'final-whistle': 0.7, egress: 0.9,
  },
  section: {
    'pre-gates': 0.02, ingress: 0.5, 'first-half': 0.95, halftime: 0.6,
    'second-half': 0.95, 'final-whistle': 0.8, egress: 0.35,
  },
  'food-court': {
    'pre-gates': 0.05, ingress: 0.5, 'first-half': 0.35, halftime: 0.95,
    'second-half': 0.4, 'final-whistle': 0.3, egress: 0.22,
  },
  hydration: {
    'pre-gates': 0.02, ingress: 0.4, 'first-half': 0.3, halftime: 0.8,
    'second-half': 0.45, 'final-whistle': 0.3, egress: 0.28,
  },
  'accessible-facility': {
    'pre-gates': 0.02, ingress: 0.35, 'first-half': 0.25, halftime: 0.6,
    'second-half': 0.3, 'final-whistle': 0.35, egress: 0.45,
  },
  'prayer-room': {
    'pre-gates': 0.02, ingress: 0.2, 'first-half': 0.15, halftime: 0.35,
    'second-half': 0.2, 'final-whistle': 0.15, egress: 0.1,
  },
  'first-aid': {
    'pre-gates': 0.02, ingress: 0.15, 'first-half': 0.2, halftime: 0.3,
    'second-half': 0.25, 'final-whistle': 0.25, egress: 0.3,
  },
  'transit-hub': {
    'pre-gates': 0.3, ingress: 0.7, 'first-half': 0.1, halftime: 0.1,
    'second-half': 0.15, 'final-whistle': 0.6, egress: 0.98,
  },
};

/** Scenario multipliers by zone kind (1 where a scenario leaves a kind untouched). */
const SCENARIO_MULTIPLIER: Record<ScenarioId, Partial<Record<ZoneKind, number>>> = {
  normal: {},
  // Arrowhead replay (June 16): too few gates open — ingress pressure piles up.
  'gate-bottleneck': { gate: 1.45, concourse: 1.15, 'transit-hub': 1.2 },
  // MetLife replay (post-match): everyone leaves at once, transit saturates.
  'egress-surge': { gate: 1.25, 'transit-hub': 1.35, concourse: 1.1 },
  // Shelter-in-place: fans move OFF outdoor zones INTO concourses.
  'weather-hold': { concourse: 1.35, section: 0.7, gate: 0.5, 'transit-hub': 0.6 },
};

/** Deterministic jitter of ±6 density points, stable per (seed, venue, zone, minute). */
function jitter(seed: number, venueId: string, zoneId: string, minute: number): number {
  const rng = createRng(deriveSeed(seed, `${venueId}:${zoneId}:${minute}`));
  return range(rng, -6, 6);
}

function statusFor(densityPct: number): ZoneStatus {
  if (densityPct >= CRITICAL_THRESHOLD) return 'critical';
  if (densityPct >= BUSY_THRESHOLD) return 'busy';
  return 'comfortable';
}

/** Queue minutes grow non-linearly with density at service points. */
function queueMinutesFor(kind: ZoneKind, densityPct: number): number {
  const serviced: readonly ZoneKind[] = ['gate', 'food-court', 'hydration'];
  if (!serviced.includes(kind)) return 0;
  // Efficiency: a closed-form curve instead of a queue simulation — indistinguishable
  // at demo scale and fully deterministic.
  const load = densityPct / 100;
  return Math.round(2 + 43 * load * load);
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Simulate every zone and transit link of a venue at one minute.
 *
 * Deterministic: identical inputs always return an identical snapshot.
 *
 * @example
 * const snap = simulateVenue('metlife', 'egress-surge', 120, 26);
 * snap?.zones.find((z) => z.kind === 'transit-hub')?.status; // 'critical'
 */
export function simulateVenue(
  venueId: string,
  scenario: ScenarioId,
  minute: number,
  seed: number,
): CrowdSnapshot | undefined {
  const venue = getVenue(venueId);
  const graph: StadiumGraph | undefined = buildStadiumGraph(venueId);
  if (venue === undefined || graph === undefined) return undefined;
  const phase = phaseForMinute(minute);

  const zones: ZoneCrowd[] = graph.zones.map((z) => {
    const base = BASE_OCCUPANCY[z.kind][phase] * 100;
    const multiplier = SCENARIO_MULTIPLIER[scenario][z.kind] ?? 1;
    const densityPct = clampPct(base * multiplier + jitter(seed, venue.id, z.id, minute));
    return {
      zoneId: z.id,
      name: z.name,
      kind: z.kind,
      densityPct,
      status: statusFor(densityPct),
      queueMinutes: queueMinutesFor(z.kind, densityPct),
    };
  });

  const hubBase = BASE_OCCUPANCY['transit-hub'][phase] * 100;
  const hubMultiplier = SCENARIO_MULTIPLIER[scenario]['transit-hub'] ?? 1;
  const transit: TransitLoad[] = venue.transit.map((t) => {
    const utilizationPct = clampPct(
      hubBase * hubMultiplier + jitter(seed, venue.id, `transit:${t.name}`, minute),
    );
    // Wait scales with utilization and inversely with link throughput.
    const waitMinutes = Math.round(
      (utilizationPct / 100) * (venue.capacity / 40 / t.peakThroughputPerMinute) + 2,
    );
    return {
      name: t.name,
      mode: t.mode,
      utilizationPct,
      waitMinutes,
      status: statusFor(utilizationPct),
    };
  });

  return { venueId: venue.id, minute, phase, scenario, zones, transit };
}

/**
 * Simulate a window of minutes (inclusive) at a fixed step.
 *
 * @example
 * const series = simulateWindow('metlife', 26, 105, 135, 10, 'egress-surge');
 * series.length; // 4 snapshots: 105, 115, 125, 135
 */
export function simulateWindow(
  venueId: string,
  seed: number,
  fromMinute: number,
  toMinute: number,
  stepMinutes = 5,
  scenario: ScenarioId = 'normal',
): CrowdSnapshot[] {
  const snapshots: CrowdSnapshot[] = [];
  for (let m = fromMinute; m <= toMinute; m += stepMinutes) {
    const snap = simulateVenue(venueId, scenario, m, seed);
    if (snap !== undefined) snapshots.push(snap);
  }
  return snapshots;
}
