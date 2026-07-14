// incidents.ts — incident lifecycle and deterministic triage.
// Boundary: pure state transitions + a priority formula over (severity, zone
// density, category). The AI layer DRAFTS incident reports; this module owns
// what a valid incident is and how the queue orders.

import { type CrowdSnapshot } from './crowd';
import { type AppError, appError } from './errors';
import { type Result, err, ok } from './result';

/** Incident categories the platform recognises. */
export type IncidentCategory = 'crowd' | 'medical' | 'security' | 'facility' | 'weather';

/** Severity ladder. */
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Lifecycle states. */
export type IncidentStatus = 'reported' | 'triaged' | 'dispatched' | 'resolved';

/** All categories/severities/statuses, for pickers and matrix tests. */
export const INCIDENT_CATEGORIES: readonly IncidentCategory[] = [
  'crowd',
  'medical',
  'security',
  'facility',
  'weather',
];
export const INCIDENT_SEVERITIES: readonly IncidentSeverity[] = [
  'low',
  'medium',
  'high',
  'critical',
];
export const INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'reported',
  'triaged',
  'dispatched',
  'resolved',
];

/** An incident record. */
export interface Incident {
  readonly id: string;
  readonly venueId: string;
  readonly zoneId: string;
  readonly category: IncidentCategory;
  readonly severity: IncidentSeverity;
  readonly summary: string;
  readonly status: IncidentStatus;
  /** Match-relative minute the incident was reported (time is a parameter). */
  readonly reportedAtMinute: number;
}

/** Legal lifecycle transitions — anything else is rejected. */
const NEXT_STATUS: Record<IncidentStatus, IncidentStatus | undefined> = {
  reported: 'triaged',
  triaged: 'dispatched',
  dispatched: 'resolved',
  resolved: undefined,
};

/** Severity weight in the triage score. */
const SEVERITY_WEIGHT: Record<IncidentSeverity, number> = {
  low: 1,
  medium: 3,
  high: 7,
  critical: 15,
};

/** Category weight — medical and security outrank comfort issues at equal severity. */
const CATEGORY_WEIGHT: Record<IncidentCategory, number> = {
  medical: 3,
  security: 2.5,
  crowd: 2,
  weather: 1.5,
  facility: 1,
};

/**
 * Advance an incident along its lifecycle.
 *
 * @example
 * const next = advanceIncident(incident); // reported → triaged
 * const done = advanceIncident({ ...incident, status: 'resolved' }); // err: terminal
 */
export function advanceIncident(incident: Incident): Result<Incident, AppError> {
  const next = NEXT_STATUS[incident.status];
  if (next === undefined) {
    return err(appError('VALIDATION_FAILED', `incident ${incident.id} already resolved`));
  }
  return ok({ ...incident, status: next });
}

/**
 * Triage score: severity × category weight × (1 + zone density share).
 * Higher = handled first. Deterministic given the same snapshot.
 *
 * @example
 * triageScore(critMedicalInPackedZone, snap) > triageScore(lowFacilityInEmptyZone, snap); // true
 */
export function triageScore(incident: Incident, snapshot: CrowdSnapshot | undefined): number {
  const density =
    snapshot?.zones.find((z) => z.zoneId === incident.zoneId)?.densityPct ?? 50;
  return SEVERITY_WEIGHT[incident.severity] * CATEGORY_WEIGHT[incident.category] * (1 + density / 100);
}

/**
 * Order the open (non-resolved) incidents by triage score, highest first.
 * Ties break on earlier report minute, then id — fully deterministic.
 *
 * @example
 * const queue = triageQueue(incidents, snap);
 */
export function triageQueue(
  incidents: readonly Incident[],
  snapshot: CrowdSnapshot | undefined,
): readonly Incident[] {
  return [...incidents]
    .filter((i) => i.status !== 'resolved')
    .sort((a, b) => {
      const scoreDiff = triageScore(b, snapshot) - triageScore(a, snapshot);
      if (scoreDiff !== 0) return scoreDiff;
      if (a.reportedAtMinute !== b.reportedAtMinute) {
        return a.reportedAtMinute - b.reportedAtMinute;
      }
      return a.id.localeCompare(b.id);
    });
}

/** Seeded demo incidents for a venue — timestamps parameterised, never fossilised. */
export function seedIncidents(venueId: string, baseMinute: number): Incident[] {
  return [
    {
      id: `${venueId}-inc-001`,
      venueId,
      zoneId: 'concourse-s',
      category: 'crowd',
      severity: 'high',
      summary: 'Congestion building at the south concourse food-court queues.',
      status: 'reported',
      reportedAtMinute: baseMinute,
    },
    {
      id: `${venueId}-inc-002`,
      venueId,
      zoneId: 'gate-d',
      category: 'facility',
      severity: 'medium',
      summary: 'One turnstile lane out of service at Gate D.',
      status: 'triaged',
      reportedAtMinute: baseMinute - 12,
    },
    {
      id: `${venueId}-inc-003`,
      venueId,
      zoneId: 'sec-124',
      category: 'medical',
      severity: 'critical',
      summary: 'Fan reporting chest pain in Section 124 — responder en route.',
      status: 'dispatched',
      reportedAtMinute: baseMinute - 4,
    },
  ];
}
