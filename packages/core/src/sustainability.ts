// sustainability.ts — deterministic emission factors and venue sustainability tiles.
// Boundary: every kg CO2e in the product comes from THIS factor table (sources cited
// below) via pure arithmetic — the assistant and missions must call these functions,
// never restate numbers. Context: an independent June 2026 estimate (Greenly) put the
// tournament's footprint at ~7.8 Mt CO2e — the fan-side lever is mode choice.

import { simulateVenue } from './crowd';
import { getVenue } from './venues';

/** Travel modes the commute comparison understands. */
export type CommuteMode = 'rail' | 'bus' | 'rideshare' | 'walk';

/** All modes, for pickers and matrix tests. */
export const COMMUTE_MODES: readonly CommuteMode[] = ['rail', 'bus', 'rideshare', 'walk'];

/**
 * Emission factors in kg CO2e per passenger-km.
 * Sources: typical US/UK government conversion-factor ranges (rail ~0.035–0.041,
 * transit bus ~0.08–0.10, single-occupancy gasoline car ~0.17–0.19). Demo-curated,
 * cited, and unit-consistent — asserted in tests.
 */
export const EMISSION_FACTORS_KG_PER_KM: Record<CommuteMode, number> = {
  rail: 0.038,
  bus: 0.09,
  rideshare: 0.18,
  walk: 0,
};

/** One mode's computed footprint for a trip. */
export interface CommuteOption {
  readonly mode: CommuteMode;
  readonly distanceKm: number;
  readonly kgCo2e: number;
  /** Saving versus doing the same trip by rideshare (the default behaviour). */
  readonly kgCo2eSavedVsRideshare: number;
}

/**
 * Footprint of a trip by one mode. Rounded to 2 decimals for display stability.
 *
 * @example
 * commuteFootprint('rail', 20).kgCo2e; // 0.76
 */
export function commuteFootprint(mode: CommuteMode, distanceKm: number): CommuteOption {
  const kg = round2(EMISSION_FACTORS_KG_PER_KM[mode] * distanceKm);
  const rideshareKg = round2(EMISSION_FACTORS_KG_PER_KM.rideshare * distanceKm);
  return {
    mode,
    distanceKm,
    kgCo2e: kg,
    kgCo2eSavedVsRideshare: round2(Math.max(0, rideshareKg - kg)),
  };
}

/**
 * Compare all modes for a trip, greenest first.
 *
 * @example
 * compareCommute(20)[0]?.mode; // 'walk'
 */
export function compareCommute(distanceKm: number): readonly CommuteOption[] {
  return COMMUTE_MODES.map((m) => commuteFootprint(m, distanceKm)).sort(
    (a, b) => a.kgCo2e - b.kgCo2e,
  );
}

/** Venue-level sustainability tiles for the ops dashboard. */
export interface SustainabilityTiles {
  readonly venueId: string;
  readonly minute: number;
  /** Percent of matchday waste diverted from landfill (simulated, phase-dependent). */
  readonly wasteDivertedPct: number;
  /** Cumulative water-refill count at hydration stations. */
  readonly waterRefills: number;
  /** Energy drawn so far this matchday (kWh, simulated). */
  readonly energyKwh: number;
  /** kg CO2e saved by fans who chose transit over rideshare (from mission data). */
  readonly kgCo2eSavedByTransit: number;
}

/**
 * Compute the venue sustainability tiles at a minute. Fully derived: refills follow
 * hydration-station traffic; energy follows occupancy; transit savings follow the
 * transit-hub share of the crowd — all from the crowd engine.
 *
 * @example
 * sustainabilityTiles('metlife', 50, 26)?.waterRefills; // deterministic number
 */
export function sustainabilityTiles(
  venueId: string,
  minute: number,
  seed: number,
): SustainabilityTiles | undefined {
  const venue = getVenue(venueId);
  const snap = simulateVenue(venueId, 'normal', minute, seed);
  if (venue === undefined || snap === undefined) return undefined;

  const elapsed = Math.max(0, minute + 120); // matchday minutes since gates opened
  const occupancy =
    snap.zones.reduce((sum, z) => sum + z.densityPct, 0) / (snap.zones.length * 100);
  const hydrationTraffic = snap.zones
    .filter((z) => z.kind === 'hydration')
    .reduce((sum, z) => sum + z.densityPct, 0);
  const transitShare =
    snap.transit.reduce((sum, t) => sum + t.utilizationPct, 0) / (snap.transit.length * 100);

  // Assume ~55% of arriving fans use the modelled transit links for an avg 15 km trip.
  const transitRiders = Math.round(venue.capacity * transitShare * 0.55);
  const perRiderSaving = commuteFootprint('rail', 15).kgCo2eSavedVsRideshare;

  return {
    venueId: venue.id,
    minute,
    wasteDivertedPct: Math.round(58 + occupancy * 20),
    waterRefills: Math.round(hydrationTraffic * elapsed * 0.9),
    energyKwh: Math.round(venue.capacity * 0.11 * (elapsed / 60) * (0.6 + occupancy)),
    kgCo2eSavedByTransit: round2(transitRiders * perRiderSaving),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
