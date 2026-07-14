// routing.ts — crowd-aware, accessibility-aware safest-route engine.
// Boundary: Dijkstra over the stadium graph with a composite cost (distance ×
// crowd-penalty × accessibility-penalty). Hard rule: never traverse a 'critical'
// zone unless no alternative exists — and then say so explicitly.

import { type CrowdSnapshot, type ZoneCrowd, simulateVenue, type ScenarioId } from './crowd';
import { type AppError, appError } from './errors';
import { type Result, err, ok } from './result';
import { type GraphEdge, type StadiumGraph, buildStadiumGraph } from './stadium-graph';

/** Accessibility profiles that change what "best route" means. */
export type AccessibilityProfile = 'none' | 'wheelchair' | 'low-vision' | 'sensory-sensitive';

/** All profiles, for pickers and matrix tests. */
export const ACCESSIBILITY_PROFILES: readonly AccessibilityProfile[] = [
  'none',
  'wheelchair',
  'low-vision',
  'sensory-sensitive',
];

/** One leg of a recommended route. */
export interface RouteLeg {
  readonly fromZoneId: string;
  readonly toZoneId: string;
  readonly toZoneName: string;
  readonly meters: number;
  readonly stepFree: boolean;
  /** Live status of the destination zone when the route was computed. */
  readonly zoneStatus: ZoneCrowd['status'];
  /** Plain-language instruction for this leg. */
  readonly instruction: string;
}

/** A complete route recommendation with the engine's reasoning. */
export interface RouteRecommendation {
  readonly fromZoneId: string;
  readonly toZoneId: string;
  readonly legs: readonly RouteLeg[];
  readonly totalMeters: number;
  readonly etaMinutes: number;
  /** 'safe' = no busy/critical zones; 'caution' = busy; 'unavoidable-critical' = told the user. */
  readonly risk: 'safe' | 'caution' | 'unavoidable-critical';
  /** Engine-computed explanation quoting real densities (never hand-written numbers). */
  readonly explanation: string;
}

/** Walking speed by profile (m/min) — drives ETA. */
const WALK_SPEED: Record<AccessibilityProfile, number> = {
  none: 75,
  wheelchair: 60,
  'low-vision': 55,
  'sensory-sensitive': 70,
};

/** Multiplicative penalty per zone status — makes crowded paths expensive. */
const STATUS_PENALTY: Record<ZoneCrowd['status'], number> = {
  comfortable: 1,
  busy: 1.8,
  critical: 50, // effectively forbidden; only chosen when nothing else connects
};

/** Extra penalty for high-crowd-exposure edges for sensory-sensitive fans. */
const SENSORY_EXPOSURE_PENALTY: Record<GraphEdge['crowdExposure'], number> = {
  low: 1,
  medium: 1.6,
  high: 2.6,
};

interface CostContext {
  readonly statusByZone: ReadonlyMap<string, ZoneCrowd['status']>;
  readonly profile: AccessibilityProfile;
}

function edgeCost(edge: GraphEdge, ctx: CostContext): number | undefined {
  // Wheelchair users only ever see step-free edges — a hard filter, not a penalty.
  if (ctx.profile === 'wheelchair' && !edge.stepFree) return undefined;
  const status = ctx.statusByZone.get(edge.to) ?? 'comfortable';
  let cost = edge.meters * STATUS_PENALTY[status];
  if (ctx.profile === 'sensory-sensitive') {
    cost *= SENSORY_EXPOSURE_PENALTY[edge.crowdExposure];
  }
  if (ctx.profile === 'low-vision') {
    // Fewer decision points beat raw distance: charge a flat cost per leg.
    cost += 40;
  }
  return cost;
}

interface DijkstraResult {
  readonly path: readonly string[];
  readonly edges: readonly GraphEdge[];
}

function dijkstra(
  graph: StadiumGraph,
  from: string,
  to: string,
  ctx: CostContext,
): DijkstraResult | undefined {
  const dist = new Map<string, number>();
  const prevEdge = new Map<string, GraphEdge>();
  const visited = new Set<string>();
  dist.set(from, 0);

  // Efficiency: linear-scan priority selection — graphs are <40 nodes, so a heap
  // would be pure ceremony (route solve stays well under 5ms; benchmarked in tests).
  for (;;) {
    let current: string | undefined;
    let best = Infinity;
    for (const [node, d] of dist) {
      if (!visited.has(node) && d < best) {
        best = d;
        current = node;
      }
    }
    if (current === undefined) return undefined;
    if (current === to) break;
    visited.add(current);
    for (const edge of graph.edges) {
      if (edge.from !== current) continue;
      const cost = edgeCost(edge, ctx);
      if (cost === undefined) continue;
      const next = best + cost;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prevEdge.set(edge.to, edge);
      }
    }
  }

  const edges: GraphEdge[] = [];
  let cursor = to;
  while (cursor !== from) {
    const edge = prevEdge.get(cursor);
    if (edge === undefined) return undefined;
    edges.unshift(edge);
    cursor = edge.from;
  }
  return { path: [from, ...edges.map((e) => e.to)], edges };
}

function legInstruction(edge: GraphEdge, toName: string, status: ZoneCrowd['status']): string {
  const verb = edge.stepFree ? 'Continue' : 'Take the stairs';
  const crowd =
    status === 'critical'
      ? ' — expect heavy crowding'
      : status === 'busy'
        ? ' — moderately busy'
        : '';
  return `${verb} ${edge.meters} m to ${toName}${crowd}.`;
}

/**
 * Compute the safest route between two zones under live crowd conditions.
 *
 * The composite cost prefers longer-but-calmer paths; 'critical' zones are only
 * traversed when the graph offers no alternative, and the risk field says so.
 *
 * @example
 * const r = recommendRoute('metlife', 'gate-d', 'sec-124', 'none', 'normal', 30, 26);
 * if (r.ok) r.value.explanation; // quotes the actual density numbers it used
 */
export function recommendRoute(
  venueId: string,
  fromZoneId: string,
  toZoneId: string,
  profile: AccessibilityProfile,
  scenario: ScenarioId,
  minute: number,
  seed: number,
): Result<RouteRecommendation, AppError> {
  const graph = buildStadiumGraph(venueId);
  const snapshot: CrowdSnapshot | undefined = simulateVenue(venueId, scenario, minute, seed);
  if (graph === undefined || snapshot === undefined) {
    return err(appError('NOT_FOUND', `unknown venue "${venueId}"`));
  }
  const zoneIds = new Set(graph.zones.map((z) => z.id));
  if (!zoneIds.has(fromZoneId) || !zoneIds.has(toZoneId)) {
    return err(appError('NOT_FOUND', `unknown zone "${fromZoneId}" or "${toZoneId}"`));
  }
  if (fromZoneId === toZoneId) {
    return ok({
      fromZoneId,
      toZoneId,
      legs: [],
      totalMeters: 0,
      etaMinutes: 0,
      risk: 'safe',
      explanation: 'You are already at your destination.',
    });
  }

  const statusByZone = new Map(snapshot.zones.map((z) => [z.zoneId, z.status]));
  const densityByZone = new Map(snapshot.zones.map((z) => [z.zoneId, z.densityPct]));
  const nameByZone = new Map(graph.zones.map((z) => [z.id, z.name]));

  const found = dijkstra(graph, fromZoneId, toZoneId, { statusByZone, profile });
  if (found === undefined) {
    return err(
      appError('ROUTE_UNAVAILABLE', `no ${profile} path ${fromZoneId}→${toZoneId} in ${venueId}`),
    );
  }

  const legs: RouteLeg[] = found.edges.map((edge) => {
    const status = statusByZone.get(edge.to) ?? 'comfortable';
    const toName = nameByZone.get(edge.to) ?? edge.to;
    return {
      fromZoneId: edge.from,
      toZoneId: edge.to,
      toZoneName: toName,
      meters: edge.meters,
      stepFree: edge.stepFree,
      zoneStatus: status,
      instruction: legInstruction(edge, toName, status),
    };
  });

  const totalMeters = legs.reduce((sum, l) => sum + l.meters, 0);
  const etaMinutes = Math.max(1, Math.round(totalMeters / WALK_SPEED[profile]));
  const statuses = legs.map((l) => l.zoneStatus);
  const risk: RouteRecommendation['risk'] = statuses.includes('critical')
    ? 'unavoidable-critical'
    : statuses.includes('busy')
      ? 'caution'
      : 'safe';

  const worst = legs.reduce(
    (acc, l) => {
      const d = densityByZone.get(l.toZoneId) ?? 0;
      return d > acc.density ? { name: l.toZoneName, density: d } : acc;
    },
    { name: 'route', density: 0 },
  );
  const explanation =
    risk === 'unavoidable-critical'
      ? `No fully clear path exists right now: ${worst.name} is at ${worst.density}% density. This is the least-crowded option — a steward can assist.`
      : `Routed via ${legs.length} legs; busiest point is ${worst.name} at ${worst.density}% density. ETA ${etaMinutes} min for ${totalMeters} m.`;

  return ok({ fromZoneId, toZoneId, legs, totalMeters, etaMinutes, risk, explanation });
}
