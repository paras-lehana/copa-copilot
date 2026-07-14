// gamification.ts — operational missions, the single source of point math, levels.
// Boundary: every mission binds to an ENGINE metric (crowd, egress, entry,
// sustainability) so points always trace to a computed operational outcome. UI and
// assistant strings must call pointsForCo2/pointsForCongestionAvoided — a hardcoded
// figure that contradicts the engine is a known scoring regression.

import { phaseForMinute } from './crowd';
import { type AppError, appError } from './errors';
import { type EntryReadiness, isWithinArrivalWindow } from './entry';
import { type Result, err, ok } from './result';
import { type CommuteMode, commuteFootprint } from './sustainability';

/** Mission identifiers. */
export type MissionId =
  | 'beat-the-rush'
  | 'green-footprint'
  | 'smart-exit'
  | 'refill-run'
  | 'route-follow';

/** A mission definition — constants-as-data. */
export interface Mission {
  readonly id: MissionId;
  readonly title: string;
  readonly description: string;
  /** Which engine metric completion is validated against. */
  readonly metric: 'arrival-window' | 'commute-mode' | 'egress-advice' | 'hydration' | 'route-compliance';
  readonly basePoints: number;
}

/** The mission catalog. */
export const MISSIONS: Record<MissionId, Mission> = {
  'beat-the-rush': {
    id: 'beat-the-rush',
    title: 'Beat the Rush',
    description: 'Arrive inside your recommended window and skip the gate crush.',
    metric: 'arrival-window',
    basePoints: 50,
  },
  'green-footprint': {
    id: 'green-footprint',
    title: 'Green Footprint',
    description: 'Take rail, bus or walk to the stadium instead of a rideshare.',
    metric: 'commute-mode',
    basePoints: 30,
  },
  'smart-exit': {
    id: 'smart-exit',
    title: 'Smart Exit',
    description: 'Follow the exit-wave advice and help drain the bowl smoothly.',
    metric: 'egress-advice',
    basePoints: 40,
  },
  'refill-run': {
    id: 'refill-run',
    title: 'Refill Run',
    description: 'Refill a bottle at a hydration station on a heat-protocol day.',
    metric: 'hydration',
    basePoints: 20,
  },
  'route-follow': {
    id: 'route-follow',
    title: 'Route Follow',
    description: 'Follow a recommended safe route through the concourse.',
    metric: 'route-compliance',
    basePoints: 25,
  },
};

/** All mission ids, for pickers and matrix tests. */
export const MISSION_IDS: readonly MissionId[] = Object.keys(MISSIONS) as MissionId[];

/**
 * Points for CO2e saved: 10 points per kg, rounded — THE formula. Assistant copy,
 * mission rewards and leaderboards all call this.
 *
 * @example
 * pointsForCo2(1.55); // 16
 */
export function pointsForCo2(kgCo2eSaved: number): number {
  return Math.round(kgCo2eSaved * 10);
}

/**
 * Points for congestion avoided (minutes of projected queueing skipped).
 *
 * @example
 * pointsForCongestionAvoided(12); // 24
 */
export function pointsForCongestionAvoided(minutesAvoided: number): number {
  return Math.round(minutesAvoided * 2);
}

/** Level curve: 0, 100, 250, 450, 700, 1000, ... (+50 growth per level). */
export const LEVELS: readonly { readonly level: number; readonly minPoints: number }[] = [
  { level: 1, minPoints: 0 },
  { level: 2, minPoints: 100 },
  { level: 3, minPoints: 250 },
  { level: 4, minPoints: 450 },
  { level: 5, minPoints: 700 },
  { level: 6, minPoints: 1000 },
  { level: 7, minPoints: 1350 },
  { level: 8, minPoints: 1750 },
];

/**
 * The level for a point total.
 *
 * @example
 * levelForPoints(120); // 2
 */
export function levelForPoints(points: number): number {
  let current = 1;
  for (const l of LEVELS) if (points >= l.minPoints) current = l.level;
  return current;
}

/** Facts a completion claim must supply, per metric. */
export interface CompletionClaim {
  readonly missionId: MissionId;
  /** Match-relative minute the claimed action happened. */
  readonly minute: number;
  /** For commute-mode claims. */
  readonly commuteMode?: CommuteMode;
  readonly commuteDistanceKm?: number;
  /** For arrival-window claims. */
  readonly arrivalWindow?: EntryReadiness['arrivalWindow'];
  /** For egress claims: the advised departure minute the fan followed. */
  readonly advisedLeaveMinute?: number;
  /** For hydration claims: whether a heat protocol was active. */
  readonly heatProtocolActive?: boolean;
}

/** A validated completion with the points awarded and why. */
export interface CompletionAward {
  readonly missionId: MissionId;
  readonly points: number;
  readonly reason: string;
}

/**
 * Validate a mission completion claim and compute the award. Every path uses the
 * shared point formulas; invalid claims return typed errors, never silent zeros.
 *
 * @example
 * validateCompletion({ missionId: 'green-footprint', minute: -60, commuteMode: 'rail', commuteDistanceKm: 15 });
 * // ok: basePoints + pointsForCo2(saving vs rideshare)
 */
export function validateCompletion(claim: CompletionClaim): Result<CompletionAward, AppError> {
  const mission = MISSIONS[claim.missionId];
  switch (mission.metric) {
    case 'arrival-window': {
      if (claim.arrivalWindow === undefined) {
        return err(appError('MISSION_REJECTED', 'arrival window missing from claim'));
      }
      if (!isWithinArrivalWindow(claim.arrivalWindow, claim.minute)) {
        return err(appError('MISSION_REJECTED', `minute ${claim.minute} outside arrival window`));
      }
      return ok({
        missionId: mission.id,
        points: mission.basePoints,
        reason: `Arrived inside the recommended window (${claim.arrivalWindow.fromMinute}' to ${claim.arrivalWindow.toMinute}').`,
      });
    }
    case 'commute-mode': {
      if (claim.commuteMode === undefined || claim.commuteDistanceKm === undefined) {
        return err(appError('MISSION_REJECTED', 'commute mode/distance missing'));
      }
      if (claim.commuteMode === 'rideshare') {
        return err(appError('MISSION_REJECTED', 'rideshare does not earn Green Footprint'));
      }
      if (claim.commuteDistanceKm <= 0 || claim.commuteDistanceKm > 120) {
        return err(appError('MISSION_REJECTED', 'implausible commute distance'));
      }
      const option = commuteFootprint(claim.commuteMode, claim.commuteDistanceKm);
      const bonus = pointsForCo2(option.kgCo2eSavedVsRideshare);
      return ok({
        missionId: mission.id,
        points: mission.basePoints + bonus,
        reason: `Saved ${option.kgCo2eSavedVsRideshare} kg CO2e vs rideshare (+${bonus} bonus points).`,
      });
    }
    case 'egress-advice': {
      if (claim.advisedLeaveMinute === undefined) {
        return err(appError('MISSION_REJECTED', 'no advised departure minute in claim'));
      }
      if (Math.abs(claim.minute - claim.advisedLeaveMinute) > 5) {
        return err(appError('MISSION_REJECTED', 'departure did not follow the advice window'));
      }
      return ok({
        missionId: mission.id,
        points: mission.basePoints,
        reason: `Left at ${claim.minute}' as advised (${claim.advisedLeaveMinute}').`,
      });
    }
    case 'hydration': {
      if (claim.heatProtocolActive !== true) {
        return err(appError('MISSION_REJECTED', 'Refill Run only counts on heat-protocol days'));
      }
      return ok({
        missionId: mission.id,
        points: mission.basePoints,
        reason: 'Refilled during an active heat protocol.',
      });
    }
    case 'route-compliance': {
      if (phaseForMinute(claim.minute) === 'pre-gates') {
        return err(appError('MISSION_REJECTED', 'route missions run on matchday only'));
      }
      return ok({
        missionId: mission.id,
        points: mission.basePoints,
        reason: 'Followed the recommended route.',
      });
    }
  }
}

/**
 * Clamp a client-restored point total to what the server can justify — the
 * anti-minting rule: restored points may never exceed the theoretical maximum
 * from completing every mission with generous bonuses.
 *
 * @example
 * clampRestoredPoints(999999); // MAX_RESTORABLE_POINTS
 */
export const MAX_RESTORABLE_POINTS = 2000;

export function clampRestoredPoints(claimed: number): number {
  if (!Number.isFinite(claimed) || claimed < 0) return 0;
  return Math.min(Math.round(claimed), MAX_RESTORABLE_POINTS);
}
