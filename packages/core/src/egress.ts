// egress.ts — the exit-wave advisor: the anti-MetLife feature.
// Boundary: models post-match outflow as gate + transit throughput against section
// populations, then recommends WHEN to leave and WHICH gate/link to use. All numbers
// derive from the venue registry and the crowd engine — nothing hand-tuned per demo.

import { type ScenarioId, simulateVenue } from './crowd';
import { type AppError, appError } from './errors';
import { type Result, err, ok } from './result';
import { type TransitLink, getVenue } from './venues';

/** How the fan intends to leave. */
export type EgressMode = TransitLink['mode'];

/** All egress modes, for pickers and matrix tests. */
export const EGRESS_MODES: readonly EgressMode[] = ['rail', 'bus', 'rideshare', 'walk'];

/** Advice for one candidate departure minute. */
export interface DepartureOption {
  /** Minutes after kickoff to start leaving (e.g. 82 = leave at the 82nd minute). */
  readonly leaveAtMinute: number;
  /** Projected minutes from seat to boarding/road, queueing included. */
  readonly projectedExitMinutes: number;
  /** Crowd status of the venue's transit hubs at that minute. */
  readonly hubStatus: 'comfortable' | 'busy' | 'critical';
}

/** The advisor's full recommendation. */
export interface EgressAdvice {
  readonly venueId: string;
  readonly mode: EgressMode;
  readonly bestOption: DepartureOption;
  readonly options: readonly DepartureOption[];
  /** Minutes saved by the best option versus leaving at full time (105'). */
  readonly minutesSavedVsFullTime: number;
  /** Engine-computed narrative quoting the numbers it used. */
  readonly explanation: string;
}

/** Candidate departure minutes the advisor evaluates (75' through 135'). */
export const DEPARTURE_CANDIDATES: readonly number[] = [75, 82, 90, 98, 105, 115, 125, 135];

function transitFor(mode: EgressMode, links: readonly TransitLink[]): TransitLink | undefined {
  const direct = links.find((l) => l.mode === mode);
  if (direct !== undefined) return direct;
  // Walking out is always possible even when no walk "link" is modelled.
  if (mode === 'walk') {
    return { mode: 'walk', name: 'On foot', walkMinutes: 0, peakThroughputPerMinute: 400 };
  }
  return undefined;
}

/**
 * Project the exit time for one departure minute: walk to hub + queue at the
 * link, where queueing scales with hub utilization and inverse link throughput.
 */
function projectOption(
  venueId: string,
  link: TransitLink,
  scenario: ScenarioId,
  leaveAtMinute: number,
  seed: number,
  capacity: number,
): DepartureOption | undefined {
  const snap = simulateVenue(venueId, scenario, leaveAtMinute, seed);
  if (snap === undefined) return undefined;
  const hub = snap.transit.find((t) => t.name === link.name) ?? snap.transit[0];
  const utilization = hub?.utilizationPct ?? 50;
  const hubStatus = hub?.status ?? 'busy';
  // Queue = share of the crowd contending for this link / its throughput.
  const contenders = (capacity * (utilization / 100)) / 18;
  const queueMinutes = Math.round(contenders / link.peakThroughputPerMinute);
  return {
    leaveAtMinute,
    projectedExitMinutes: link.walkMinutes + queueMinutes,
    hubStatus,
  };
}

/**
 * Recommend when to leave and how long the exit will take for each candidate minute.
 *
 * @example
 * const a = adviseEgress('metlife', 'rail', 'egress-surge', 26);
 * if (a.ok) a.value.minutesSavedVsFullTime; // > 0: leaving early beats the surge
 */
export function adviseEgress(
  venueId: string,
  mode: EgressMode,
  scenario: ScenarioId,
  seed: number,
): Result<EgressAdvice, AppError> {
  const venue = getVenue(venueId);
  if (venue === undefined) return err(appError('NOT_FOUND', `unknown venue "${venueId}"`));
  const link = transitFor(mode, venue.transit);
  if (link === undefined) {
    return err(appError('NOT_FOUND', `venue ${venueId} has no ${mode} link`));
  }

  const options: DepartureOption[] = [];
  for (const minute of DEPARTURE_CANDIDATES) {
    const option = projectOption(venueId, link, scenario, minute, seed, venue.capacity);
    if (option !== undefined) options.push(option);
  }
  const best = options.reduce((a, b) => (b.projectedExitMinutes < a.projectedExitMinutes ? b : a));
  const fullTime = options.find((o) => o.leaveAtMinute === 105) ?? best;
  const saved = Math.max(0, fullTime.projectedExitMinutes - best.projectedExitMinutes);

  const explanation =
    saved > 0
      ? `Leaving at ${best.leaveAtMinute}' takes ~${best.projectedExitMinutes} min via ${link.name}; waiting for full time takes ~${fullTime.projectedExitMinutes} min. You save ~${saved} min.`
      : `Exit load is steady: leaving at ${best.leaveAtMinute}' takes ~${best.projectedExitMinutes} min via ${link.name}.`;

  return ok({
    venueId: venue.id,
    mode,
    bestOption: best,
    options,
    minutesSavedVsFullTime: saved,
    explanation,
  });
}

/** One section's slot in a staggered egress plan. */
export interface StaggerSlot {
  readonly sectionZoneId: string;
  readonly releaseAtMinute: number;
  readonly viaGateZoneId: string;
}

/**
 * Organizer view: a stagger plan spreading section releases across gates and
 * minutes so no single gate/hub carries the whole bowl at once.
 *
 * @example
 * const p = planStaggeredEgress('metlife', 26);
 * if (p.ok) new Set(p.value.map((s) => s.releaseAtMinute)).size; // > 1: truly staggered
 */
export function planStaggeredEgress(
  venueId: string,
  seed: number,
): Result<readonly StaggerSlot[], AppError> {
  const venue = getVenue(venueId);
  const snap = simulateVenue(venueId, 'egress-surge', 115, seed);
  if (venue === undefined || snap === undefined) {
    return err(appError('NOT_FOUND', `unknown venue "${venueId}"`));
  }
  const sections = snap.zones.filter((z) => z.kind === 'section');
  const gates = snap.zones.filter((z) => z.kind === 'gate');
  if (gates.length === 0) return err(appError('INTERNAL', `venue ${venueId} has no gates`));

  // Busiest sections release first (they take longest to drain); gates round-robin.
  const ordered = [...sections].sort((a, b) => b.densityPct - a.densityPct);
  const slots: StaggerSlot[] = ordered.map((section, index) => {
    const gate = gates[index % gates.length];
    return {
      sectionZoneId: section.zoneId,
      releaseAtMinute: 108 + index * 4,
      viaGateZoneId: gate === undefined ? 'gate-a' : gate.zoneId,
    };
  });
  return ok(slots);
}
