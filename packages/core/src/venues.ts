// venues.ts — the registry of all 16 FIFA World Cup 2026 stadiums.
// Boundary: curated demo data (capacities/transit links compiled from public tournament
// coverage, July 2026) shaped for the simulation engine — not a live FIFA feed, and the
// UI says so. Constants-as-data: no conditionals branch on venue ids anywhere in core.

/** Stable venue identifiers (host-city based). */
export type VenueId =
  | 'metlife'
  | 'att-dallas'
  | 'arrowhead'
  | 'nrg-houston'
  | 'mercedes-benz-atlanta'
  | 'sofi-la'
  | 'levis-bayarea'
  | 'lincoln-philadelphia'
  | 'lumen-seattle'
  | 'gillette-boston'
  | 'hardrock-miami'
  | 'bcplace-vancouver'
  | 'bmo-toronto'
  | 'azteca-mexicocity'
  | 'bbva-monterrey'
  | 'akron-guadalajara';

/** Zone categories the simulation and routing understand. */
export type ZoneKind =
  | 'gate'
  | 'concourse'
  | 'section'
  | 'food-court'
  | 'hydration'
  | 'accessible-facility'
  | 'prayer-room'
  | 'first-aid'
  | 'transit-hub';

/** One navigable zone inside a venue. */
export interface Zone {
  readonly id: string;
  readonly name: string;
  readonly kind: ZoneKind;
  /** Nominal people capacity used by the density model. */
  readonly capacity: number;
  /** True when the zone is outdoors (matters under weather protocols). */
  readonly outdoor: boolean;
}

/** How fans reach the venue. */
export interface TransitLink {
  readonly mode: 'rail' | 'bus' | 'rideshare' | 'walk';
  readonly name: string;
  /** Minutes from the hub to the nearest gate on foot. */
  readonly walkMinutes: number;
  /** People per minute the link can move at peak (drives egress modeling). */
  readonly peakThroughputPerMinute: number;
}

/** A World Cup 2026 venue. */
export interface Venue {
  readonly id: VenueId;
  readonly name: string;
  readonly city: string;
  readonly country: 'USA' | 'Canada' | 'Mexico';
  readonly capacity: number;
  /** Climate-controlled (roofed) venues bypass the heat protocol. */
  readonly climateControlled: boolean;
  readonly timezone: string;
  readonly gates: readonly string[];
  readonly transit: readonly TransitLink[];
  /** Flagship venues carry a deep navigation graph; others use a generated ring. */
  readonly flagship: boolean;
}

/** Gate ids reused by the generated venue layouts. */
const STANDARD_GATES: readonly string[] = ['gate-a', 'gate-b', 'gate-c', 'gate-d'];

/** The 16-venue registry. MetLife is the flagship (hosts the July 19 final). */
export const VENUES: Record<VenueId, Venue> = {
  metlife: {
    id: 'metlife',
    name: 'New York New Jersey Stadium (MetLife)',
    city: 'East Rutherford',
    country: 'USA',
    capacity: 82500,
    climateControlled: false,
    timezone: 'America/New_York',
    gates: ['gate-a', 'gate-b', 'gate-c', 'gate-d', 'gate-e'],
    transit: [
      { mode: 'rail', name: 'NJ Transit — Meadowlands Rail', walkMinutes: 8, peakThroughputPerMinute: 160 },
      { mode: 'bus', name: 'Coach USA 351 Express', walkMinutes: 6, peakThroughputPerMinute: 60 },
      { mode: 'rideshare', name: 'Rideshare Lot P7', walkMinutes: 12, peakThroughputPerMinute: 45 },
    ],
    flagship: true,
  },
  'att-dallas': {
    id: 'att-dallas',
    name: 'Dallas Stadium (AT&T)',
    city: 'Arlington',
    country: 'USA',
    capacity: 80000,
    climateControlled: true,
    timezone: 'America/Chicago',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'bus', name: 'Trinity Metro Event Shuttle', walkMinutes: 7, peakThroughputPerMinute: 70 },
      { mode: 'rideshare', name: 'Rideshare Zone C', walkMinutes: 10, peakThroughputPerMinute: 50 },
    ],
    flagship: false,
  },
  arrowhead: {
    id: 'arrowhead',
    name: 'Kansas City Stadium (Arrowhead)',
    city: 'Kansas City',
    country: 'USA',
    capacity: 76400,
    climateControlled: false,
    timezone: 'America/Chicago',
    gates: ['gate-a', 'gate-b', 'gate-c', 'gate-d', 'gate-e', 'gate-f', 'gate-g'],
    transit: [
      { mode: 'bus', name: 'ConnectKC26 Stadium Direct', walkMinutes: 5, peakThroughputPerMinute: 65 },
      { mode: 'rideshare', name: 'Truman Complex Rideshare', walkMinutes: 14, peakThroughputPerMinute: 40 },
    ],
    flagship: false,
  },
  'nrg-houston': {
    id: 'nrg-houston',
    name: 'Houston Stadium (NRG)',
    city: 'Houston',
    country: 'USA',
    capacity: 72220,
    climateControlled: true,
    timezone: 'America/Chicago',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'rail', name: 'METRORail Red Line — Stadium Park', walkMinutes: 6, peakThroughputPerMinute: 120 },
      { mode: 'rideshare', name: 'Rideshare Yellow Lot', walkMinutes: 9, peakThroughputPerMinute: 45 },
    ],
    flagship: false,
  },
  'mercedes-benz-atlanta': {
    id: 'mercedes-benz-atlanta',
    name: 'Atlanta Stadium (Mercedes-Benz)',
    city: 'Atlanta',
    country: 'USA',
    capacity: 71000,
    climateControlled: true,
    timezone: 'America/New_York',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'rail', name: 'MARTA — Vine City / GWCC', walkMinutes: 5, peakThroughputPerMinute: 140 },
      { mode: 'rideshare', name: 'Northside Drive Rideshare', walkMinutes: 8, peakThroughputPerMinute: 45 },
    ],
    flagship: false,
  },
  'sofi-la': {
    id: 'sofi-la',
    name: 'Los Angeles Stadium (SoFi)',
    city: 'Inglewood',
    country: 'USA',
    capacity: 70240,
    climateControlled: true,
    timezone: 'America/Los_Angeles',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'rail', name: 'K Line — Downtown Inglewood + Shuttle', walkMinutes: 12, peakThroughputPerMinute: 90 },
      { mode: 'rideshare', name: 'Rideshare Lake Park', walkMinutes: 10, peakThroughputPerMinute: 55 },
    ],
    flagship: false,
  },
  'levis-bayarea': {
    id: 'levis-bayarea',
    name: 'San Francisco Bay Area Stadium (Levi’s)',
    city: 'Santa Clara',
    country: 'USA',
    capacity: 68500,
    climateControlled: false,
    timezone: 'America/Los_Angeles',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'rail', name: 'VTA Light Rail — Great America', walkMinutes: 7, peakThroughputPerMinute: 100 },
      { mode: 'rideshare', name: 'Red Lot Rideshare', walkMinutes: 9, peakThroughputPerMinute: 45 },
    ],
    flagship: false,
  },
  'lincoln-philadelphia': {
    id: 'lincoln-philadelphia',
    name: 'Philadelphia Stadium (Lincoln Financial Field)',
    city: 'Philadelphia',
    country: 'USA',
    capacity: 67594,
    climateControlled: false,
    timezone: 'America/New_York',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'rail', name: 'SEPTA Broad Street Line — NRG', walkMinutes: 6, peakThroughputPerMinute: 130 },
      { mode: 'rideshare', name: 'Pattison Rideshare Zone', walkMinutes: 8, peakThroughputPerMinute: 45 },
    ],
    flagship: false,
  },
  'lumen-seattle': {
    id: 'lumen-seattle',
    name: 'Seattle Stadium (Lumen Field)',
    city: 'Seattle',
    country: 'USA',
    capacity: 68740,
    climateControlled: false,
    timezone: 'America/Los_Angeles',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'rail', name: 'Link 1 Line — Stadium', walkMinutes: 5, peakThroughputPerMinute: 130 },
      { mode: 'rideshare', name: 'Occidental Rideshare', walkMinutes: 7, peakThroughputPerMinute: 40 },
    ],
    flagship: false,
  },
  'gillette-boston': {
    id: 'gillette-boston',
    name: 'Boston Stadium (Gillette)',
    city: 'Foxborough',
    country: 'USA',
    capacity: 64628,
    climateControlled: false,
    timezone: 'America/New_York',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'rail', name: 'MBTA Event Train — Foxboro', walkMinutes: 9, peakThroughputPerMinute: 90 },
      { mode: 'rideshare', name: 'P10 Rideshare', walkMinutes: 11, peakThroughputPerMinute: 40 },
    ],
    flagship: false,
  },
  'hardrock-miami': {
    id: 'hardrock-miami',
    name: 'Miami Stadium (Hard Rock)',
    city: 'Miami Gardens',
    country: 'USA',
    capacity: 64767,
    climateControlled: false,
    timezone: 'America/New_York',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'bus', name: 'Hard Rock Express Shuttle', walkMinutes: 6, peakThroughputPerMinute: 55 },
      { mode: 'rideshare', name: 'Rideshare Lot 18', walkMinutes: 10, peakThroughputPerMinute: 50 },
    ],
    flagship: false,
  },
  'bcplace-vancouver': {
    id: 'bcplace-vancouver',
    name: 'BC Place Vancouver',
    city: 'Vancouver',
    country: 'Canada',
    capacity: 54000,
    climateControlled: true,
    timezone: 'America/Vancouver',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'rail', name: 'SkyTrain Expo Line — Stadium–Chinatown', walkMinutes: 4, peakThroughputPerMinute: 150 },
      { mode: 'bus', name: 'TransLink Event Bus', walkMinutes: 6, peakThroughputPerMinute: 70 },
    ],
    flagship: false,
  },
  'bmo-toronto': {
    id: 'bmo-toronto',
    name: 'Toronto Stadium (BMO Field)',
    city: 'Toronto',
    country: 'Canada',
    capacity: 45736,
    climateControlled: false,
    timezone: 'America/Toronto',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'rail', name: 'GO Transit — Exhibition', walkMinutes: 5, peakThroughputPerMinute: 110 },
      { mode: 'bus', name: 'TTC 511 Streetcar', walkMinutes: 7, peakThroughputPerMinute: 60 },
    ],
    flagship: false,
  },
  'azteca-mexicocity': {
    id: 'azteca-mexicocity',
    name: 'Estadio Azteca (Estadio Banorte)',
    city: 'Mexico City',
    country: 'Mexico',
    capacity: 83264,
    climateControlled: false,
    timezone: 'America/Mexico_City',
    gates: ['gate-a', 'gate-b', 'gate-c', 'gate-d', 'gate-e', 'gate-f'],
    transit: [
      { mode: 'rail', name: 'Tren Ligero — Estadio Azteca', walkMinutes: 6, peakThroughputPerMinute: 110 },
      { mode: 'bus', name: 'Metrobús Event Service', walkMinutes: 8, peakThroughputPerMinute: 70 },
    ],
    flagship: false,
  },
  'bbva-monterrey': {
    id: 'bbva-monterrey',
    name: 'Estadio Monterrey (BBVA)',
    city: 'Guadalupe',
    country: 'Mexico',
    capacity: 53500,
    climateControlled: false,
    timezone: 'America/Monterrey',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'bus', name: 'Ecovía Event Shuttle', walkMinutes: 9, peakThroughputPerMinute: 55 },
      { mode: 'rideshare', name: 'Rideshare Zona Norte', walkMinutes: 11, peakThroughputPerMinute: 45 },
    ],
    flagship: false,
  },
  'akron-guadalajara': {
    id: 'akron-guadalajara',
    name: 'Estadio Guadalajara (Akron)',
    city: 'Zapopan',
    country: 'Mexico',
    capacity: 48071,
    climateControlled: false,
    timezone: 'America/Mexico_City',
    gates: STANDARD_GATES,
    transit: [
      { mode: 'bus', name: 'Mi Macro Periférico Shuttle', walkMinutes: 10, peakThroughputPerMinute: 55 },
      { mode: 'rideshare', name: 'Rideshare Puerta 6', walkMinutes: 8, peakThroughputPerMinute: 45 },
    ],
    flagship: false,
  },
};

/** All venue ids in registry order. */
export const VENUE_IDS: readonly VenueId[] = Object.keys(VENUES) as VenueId[];

/** Number of climate-controlled venues (asserted = 5 in tests, matching coverage). */
export const CLIMATE_CONTROLLED_COUNT: number = VENUE_IDS.filter(
  (id) => VENUES[id].climateControlled,
).length;

/**
 * Look up a venue by id.
 *
 * @example
 * getVenue('metlife')?.capacity; // 82500
 */
export function getVenue(id: string): Venue | undefined {
  return (VENUES as Record<string, Venue>)[id];
}
