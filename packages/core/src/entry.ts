// entry.ts — entry-readiness engine: the anti-ghost-ticket feature.
// Boundary: educational guidance derived from documented June 2026 failure modes
// (resale tickets never transferred; verification loops at gates). This module never
// touches real ticket APIs — it scores readiness and explains risk, honestly.

import { phaseForMinute, simulateVenue } from './crowd';
import { getVenue } from './venues';

/** Where the fan's ticket came from — drives the risk assessment. */
export type TicketSource = 'official' | 'official-resale' | 'third-party';

/** All sources, for pickers and matrix tests. */
export const TICKET_SOURCES: readonly TicketSource[] = [
  'official',
  'official-resale',
  'third-party',
];

/** One checklist item. */
export interface ChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
  /** Items the fan must resolve before matchday are flagged blocking. */
  readonly blocking: boolean;
}

/** The full entry-readiness assessment. */
export interface EntryReadiness {
  readonly venueId: string;
  readonly ticketSource: TicketSource;
  readonly riskLevel: 'low' | 'elevated' | 'high';
  /** 0–100: share of blocking+non-blocking items already satisfied. */
  readonly readinessScore: number;
  readonly checklist: readonly ChecklistItem[];
  /** Recommended arrival window (minutes before kickoff) from the ingress model. */
  readonly arrivalWindow: { readonly fromMinute: number; readonly toMinute: number };
  readonly guidance: readonly string[];
}

/** Inputs the fan supplies about their own state. */
export interface EntryFacts {
  readonly ticketSource: TicketSource;
  /** Ticket visible in the official mobile tickets app? */
  readonly transferConfirmed: boolean;
  readonly idPacked: boolean;
  readonly bagCompliant: boolean;
}

const SOURCE_RISK: Record<TicketSource, EntryReadiness['riskLevel']> = {
  official: 'low',
  'official-resale': 'low',
  'third-party': 'high',
};

const SOURCE_GUIDANCE: Record<TicketSource, readonly string[]> = {
  official: ['Your ticket is in the official channel — verify it opens in the tickets app before you travel.'],
  'official-resale': [
    'Official-resale tickets must already exist before listing, so transfer risk is low.',
    'Still confirm the ticket renders in the official tickets app before you travel.',
  ],
  'third-party': [
    'Third-party resale carries the documented "ghost ticket" risk: tickets sold before the seller holds them.',
    'Confirm the transfer LANDED in the official tickets app — a screenshot from the seller is not entry.',
    'If the transfer has not arrived, contact the platform now; gate staff cannot fix it on matchday.',
  ],
};

/**
 * Recommended arrival window: earlier when the gates are modelled busier.
 * Uses the ingress simulation so the advice tracks the crowd engine, not vibes.
 */
function arrivalWindowFor(venueId: string, seed: number): EntryReadiness['arrivalWindow'] {
  const snap = simulateVenue(venueId, 'normal', -60, seed);
  const gateAvg =
    snap === undefined
      ? 50
      : snap.zones
          .filter((z) => z.kind === 'gate')
          .reduce((sum, z, _, arr) => sum + z.densityPct / arr.length, 0);
  // Busier gates → arrive earlier and in a wider window.
  const from = gateAvg > 70 ? -150 : gateAvg > 50 ? -120 : -90;
  return { fromMinute: from, toMinute: from + 45 };
}

/**
 * Assess entry readiness for a fan.
 *
 * @example
 * const r = assessEntryReadiness('metlife', {
 *   ticketSource: 'third-party', transferConfirmed: false, idPacked: true, bagCompliant: true,
 * }, 26);
 * r?.riskLevel; // 'high' — untransferred third-party ticket is the ghost-ticket case
 */
export function assessEntryReadiness(
  venueId: string,
  facts: EntryFacts,
  seed: number,
): EntryReadiness | undefined {
  const venue = getVenue(venueId);
  if (venue === undefined) return undefined;

  const checklist: ChecklistItem[] = [
    {
      id: 'transfer',
      label: 'Ticket visible in the official mobile tickets app',
      done: facts.transferConfirmed,
      blocking: true,
    },
    { id: 'id', label: 'Photo ID packed (matching the ticket name)', done: facts.idPacked, blocking: true },
    { id: 'bag', label: 'Bag within the stadium size policy', done: facts.bagCompliant, blocking: false },
    { id: 'offline', label: 'Ticket screen saved for offline use', done: false, blocking: false },
  ];

  const doneCount = checklist.filter((c) => c.done).length;
  const readinessScore = Math.round((doneCount / checklist.length) * 100);

  // Untransferred ticket escalates ANY source to high risk — that is the failure mode.
  const baseRisk = SOURCE_RISK[facts.ticketSource];
  const riskLevel: EntryReadiness['riskLevel'] = !facts.transferConfirmed
    ? 'high'
    : baseRisk === 'high'
      ? 'elevated' // transferred third-party ticket: risk mostly retired
      : baseRisk;

  const guidance = [
    ...SOURCE_GUIDANCE[facts.ticketSource],
    ...(facts.transferConfirmed
      ? []
      : ['BLOCKING: the ticket is not confirmed in the official app yet — resolve this first.']),
  ];

  return {
    venueId: venue.id,
    ticketSource: facts.ticketSource,
    riskLevel,
    readinessScore,
    checklist,
    arrivalWindow: arrivalWindowFor(venueId, seed),
    guidance,
  };
}

/**
 * True when the given minute falls in the fan's recommended arrival window
 * (used by the Beat-the-Rush mission validation).
 */
export function isWithinArrivalWindow(
  window: EntryReadiness['arrivalWindow'],
  minute: number,
): boolean {
  return minute >= window.fromMinute && minute <= window.toMinute && phaseForMinute(minute) === 'ingress';
}
