// stadium-graph.ts — navigable zone graphs for every venue.
// Boundary: pure construction from the venue registry (no randomness, no clocks).
// MetLife (flagship, hosts the July 19 final) gets a hand-modelled layout; the other
// venues get a generated four-quadrant ring so routing works tournament-wide.

import { type Venue, type VenueId, type Zone, type ZoneKind, getVenue } from './venues';

/** How exposed to crowd pressure an edge is — feeds the routing crowd penalty. */
export type CrowdExposure = 'low' | 'medium' | 'high';

/** A walkable connection between two zones. */
export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly meters: number;
  /** False when the path includes stairs or a lift-dependency (wheelchair-blocking). */
  readonly stepFree: boolean;
  readonly crowdExposure: CrowdExposure;
  readonly outdoor: boolean;
}

/** A venue's complete navigation graph. */
export interface StadiumGraph {
  readonly venueId: VenueId;
  readonly zones: readonly Zone[];
  readonly edges: readonly GraphEdge[];
}

function zone(id: string, name: string, kind: ZoneKind, capacity: number, outdoor: boolean): Zone {
  return { id, name, kind, capacity, outdoor };
}

/** Bidirectional edge helper — the graph is stored directed both ways for routing. */
function link(
  from: string,
  to: string,
  meters: number,
  stepFree: boolean,
  crowdExposure: CrowdExposure,
  outdoor: boolean,
): GraphEdge[] {
  return [
    { from, to, meters, stepFree, crowdExposure, outdoor },
    { from: to, to: from, meters, stepFree, crowdExposure, outdoor },
  ];
}

/** Hand-modelled flagship layout for MetLife: 5 gates, 4 concourses, 8 sections + amenities. */
function buildMetlifeGraph(venue: Venue): StadiumGraph {
  const zones: Zone[] = [
    ...venue.gates.map((g, i) => zone(g, `Gate ${String.fromCharCode(65 + i)}`, 'gate', 3000, true)),
    zone('concourse-n', 'North Concourse', 'concourse', 9000, false),
    zone('concourse-e', 'East Concourse', 'concourse', 9000, false),
    zone('concourse-s', 'South Concourse', 'concourse', 9000, false),
    zone('concourse-w', 'West Concourse', 'concourse', 9000, false),
    zone('sec-111', 'Section 111', 'section', 5200, false),
    zone('sec-124', 'Section 124', 'section', 5200, false),
    zone('sec-138', 'Section 138', 'section', 5200, false),
    zone('sec-145', 'Section 145', 'section', 5200, false),
    zone('sec-224', 'Section 224', 'section', 4400, false),
    zone('sec-248', 'Section 248', 'section', 4400, false),
    zone('sec-324', 'Section 324', 'section', 3800, false),
    zone('sec-345', 'Section 345', 'section', 3800, false),
    zone('food-n', 'North Food Court', 'food-court', 1200, false),
    zone('food-s', 'South Food Court', 'food-court', 1200, false),
    zone('hydration-e', 'East Hydration Station', 'hydration', 300, false),
    zone('hydration-w', 'West Hydration Station', 'hydration', 300, false),
    zone('accessible-n', 'North Accessible Facilities', 'accessible-facility', 200, false),
    zone('prayer-w', 'West Prayer Room', 'prayer-room', 120, false),
    zone('firstaid-e', 'East First Aid', 'first-aid', 80, false),
    zone('transit-rail', 'Meadowlands Rail Hub', 'transit-hub', 6000, true),
    zone('transit-bus', 'Bus & Coach Plaza', 'transit-hub', 2500, true),
  ];

  const edges: GraphEdge[] = [
    // Transit hubs → gates (outdoor approach, high exposure at peaks).
    ...link('transit-rail', 'gate-d', 400, true, 'high', true),
    ...link('transit-rail', 'gate-e', 520, true, 'medium', true),
    ...link('transit-bus', 'gate-a', 350, true, 'medium', true),
    // Gates → concourses.
    ...link('gate-a', 'concourse-n', 120, true, 'high', false),
    ...link('gate-b', 'concourse-e', 120, true, 'medium', false),
    ...link('gate-c', 'concourse-s', 120, true, 'medium', false),
    ...link('gate-d', 'concourse-s', 140, true, 'high', false),
    ...link('gate-e', 'concourse-w', 120, true, 'low', false),
    // Concourse ring.
    ...link('concourse-n', 'concourse-e', 220, true, 'medium', false),
    ...link('concourse-e', 'concourse-s', 220, true, 'medium', false),
    ...link('concourse-s', 'concourse-w', 220, true, 'medium', false),
    ...link('concourse-w', 'concourse-n', 220, true, 'medium', false),
    // Lower-bowl sections (step-free from concourse).
    ...link('concourse-n', 'sec-111', 80, true, 'medium', false),
    ...link('concourse-e', 'sec-124', 80, true, 'medium', false),
    ...link('concourse-s', 'sec-138', 80, true, 'medium', false),
    ...link('concourse-w', 'sec-145', 80, true, 'medium', false),
    // Upper sections: each has a stairs route (not step-free) AND a longer lift
    // route (step-free) so wheelchair routing always has a lawful path.
    ...link('concourse-e', 'sec-224', 90, false, 'medium', false),
    ...link('concourse-e', 'sec-224', 150, true, 'low', false),
    ...link('concourse-e', 'sec-248', 95, false, 'medium', false),
    ...link('concourse-e', 'sec-248', 155, true, 'low', false),
    ...link('concourse-w', 'sec-324', 110, false, 'medium', false),
    ...link('concourse-w', 'sec-324', 165, true, 'low', false),
    ...link('concourse-w', 'sec-345', 115, false, 'medium', false),
    ...link('concourse-w', 'sec-345', 170, true, 'low', false),
    // Amenities.
    ...link('concourse-n', 'food-n', 60, true, 'high', false),
    ...link('concourse-s', 'food-s', 60, true, 'high', false),
    ...link('concourse-e', 'hydration-e', 40, true, 'low', false),
    ...link('concourse-w', 'hydration-w', 40, true, 'low', false),
    ...link('concourse-n', 'accessible-n', 50, true, 'low', false),
    ...link('concourse-w', 'prayer-w', 70, true, 'low', false),
    ...link('concourse-e', 'firstaid-e', 55, true, 'low', false),
  ];

  return { venueId: venue.id, zones, edges };
}

/** Generated four-quadrant ring for non-flagship venues. */
function buildGeneratedGraph(venue: Venue): StadiumGraph {
  const quadrants = ['n', 'e', 's', 'w'] as const;
  const zones: Zone[] = [
    ...venue.gates.map((g, i) =>
      zone(g, `Gate ${String.fromCharCode(65 + i)}`, 'gate', 2500, true),
    ),
    ...quadrants.map((q) =>
      zone(`concourse-${q}`, `${q.toUpperCase()} Concourse`, 'concourse', 7000, false),
    ),
    ...quadrants.map((q, i) =>
      zone(`sec-${q}`, `Section ${100 + i * 10}`, 'section', Math.round(venue.capacity / 8), false),
    ),
    zone('food-main', 'Main Food Court', 'food-court', 1000, false),
    zone('hydration-main', 'Hydration Station', 'hydration', 250, false),
    zone('accessible-main', 'Accessible Facilities', 'accessible-facility', 180, false),
    zone('firstaid-main', 'First Aid', 'first-aid', 60, false),
    zone('transit-main', 'Transit Hub', 'transit-hub', 4000, true),
  ];

  const edges: GraphEdge[] = [
    ...link('transit-main', venue.gates[0] ?? 'gate-a', 380, true, 'high', true),
    // Each gate feeds the concourse in its quadrant (cycled).
    ...venue.gates.flatMap((g, i) =>
      link(g, `concourse-${quadrants[i % 4]}`, 120, true, i === 0 ? 'high' : 'medium', false),
    ),
    // Concourse ring.
    ...quadrants.flatMap((q, i) =>
      link(`concourse-${q}`, `concourse-${quadrants[(i + 1) % 4]}`, 200, true, 'medium', false),
    ),
    // Sections: N/E step-free; S/W get a stairs route plus a longer lift route.
    ...link('concourse-n', 'sec-n', 80, true, 'medium', false),
    ...link('concourse-e', 'sec-e', 80, true, 'medium', false),
    ...link('concourse-s', 'sec-s', 90, false, 'medium', false),
    ...link('concourse-s', 'sec-s', 150, true, 'low', false),
    ...link('concourse-w', 'sec-w', 90, false, 'medium', false),
    ...link('concourse-w', 'sec-w', 150, true, 'low', false),
    // Amenities.
    ...link('concourse-n', 'food-main', 60, true, 'high', false),
    ...link('concourse-e', 'hydration-main', 45, true, 'low', false),
    ...link('concourse-s', 'accessible-main', 50, true, 'low', false),
    ...link('concourse-w', 'firstaid-main', 55, true, 'low', false),
  ];

  return { venueId: venue.id, zones, edges };
}

const graphCache = new Map<VenueId, StadiumGraph>();

/**
 * Build (and memoize) the navigation graph for a venue. Pure and deterministic:
 * identical venue data always produces an identical graph.
 *
 * @example
 * const g = buildStadiumGraph('metlife');
 * g?.zones.some((z) => z.kind === 'hydration'); // true
 */
export function buildStadiumGraph(venueId: string): StadiumGraph | undefined {
  const venue = getVenue(venueId);
  if (venue === undefined) return undefined;
  const cached = graphCache.get(venue.id);
  if (cached !== undefined) return cached;
  // Efficiency: graphs are static per process — memoized instead of rebuilt per request.
  const graph = venue.flagship ? buildMetlifeGraph(venue) : buildGeneratedGraph(venue);
  graphCache.set(venue.id, graph);
  return graph;
}
