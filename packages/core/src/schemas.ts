// schemas.ts — the single zod schema source for API requests and web forms.
// Boundary: every schema is .strict(); the shared error map yields SAFE messages
// that never echo raw input (path names only); display strings reject markup.
// Web NEVER hand-mirrors these bounds — it imports them.

import { z } from 'zod';
import { SCENARIOS } from './crowd';
import { EGRESS_MODES } from './egress';
import { MISSION_IDS } from './gamification';
import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES } from './incidents';
import { LEADERBOARD_SCOPES } from './leaderboard';
import { ACCESSIBILITY_PROFILES } from './routing';
import { COMMUTE_MODES } from './sustainability';
import { TICKET_SOURCES } from './entry';
import { VENUE_IDS } from './venues';
import { WEATHER_PRESETS } from './weather';

/** Assistant input budget (chars) — also an efficiency control on Gemini spend. */
export const ASSISTANT_INPUT_MAX_CHARS = 1000;
/** Display-name budget. */
export const DISPLAY_NAME_MAX_CHARS = 30;

/**
 * Shared error map: reports WHICH field failed and WHY-category, never the value.
 * This is the no-raw-input-echo rule as code (enum and unknown-key paths included).
 */
export const safeErrorMap: z.ZodErrorMap = (issue, ctx) => {
  const path = issue.path.join('.') || 'request';
  switch (issue.code) {
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Field "${path}" is not one of the allowed values.` };
    case z.ZodIssueCode.unrecognized_keys:
      return { message: 'The request contains fields that are not allowed.' };
    case z.ZodIssueCode.invalid_type:
      return { message: `Field "${path}" has the wrong type.` };
    case z.ZodIssueCode.too_big:
      return { message: `Field "${path}" is too large.` };
    case z.ZodIssueCode.too_small:
      return { message: `Field "${path}" is too small or missing.` };
    default:
      return { message: ctx.defaultError.includes(String(ctx.data)) ? `Field "${path}" is invalid.` : ctx.defaultError };
  }
};

const NO_MARKUP = /^[^<>]*$/;

/** Display text: bounded, markup-free (defence-in-depth against stored XSS). */
const displayText = (max: number) =>
  z.string().trim().min(1).max(max).regex(NO_MARKUP, { message: 'Markup is not allowed.' });

/**
 * zod's enum() requires a non-empty tuple literal, but our option lists are readonly
 * const arrays owned by the domain modules. This helper performs the one, documented
 * tuple assertion so every schema infers LITERAL union types — which is what keeps
 * the API layer free of `as` casts end to end.
 */
function enumFromConst<T extends string>(values: readonly T[]): z.ZodEnum<[T, ...T[]]> {
  return z.enum(values as [T, ...T[]]);
}

/** Validates a venue id against the known VENUE_IDS enum. */
export const venueIdSchema = enumFromConst(VENUE_IDS);
/** Validates a crowd/simulation scenario id against the SCENARIOS enum. */
export const scenarioSchema = enumFromConst(SCENARIOS);
/** Validates a weather preset id against the WEATHER_PRESETS enum. */
export const weatherPresetSchema = enumFromConst(WEATHER_PRESETS);

/** Match-relative minute: gates open at -240 at the earliest; egress ends by +240. */
export const minuteSchema = z.number().int().min(-240).max(240);

/** Crowd query request contract (shared with web); defaults scenario to 'normal' and minute to 30. */
export const crowdQuerySchema = z
  .object({
    scenario: scenarioSchema.default('normal'),
    minute: minuteSchema.default(30),
  })
  .strict();

/** Routing request contract (shared with web); defaults profile to 'none', scenario to 'normal', minute to 30. */
export const routingRequestSchema = z
  .object({
    venueId: venueIdSchema,
    fromZoneId: z.string().trim().min(1).max(50).regex(NO_MARKUP),
    toZoneId: z.string().trim().min(1).max(50).regex(NO_MARKUP),
    profile: enumFromConst(ACCESSIBILITY_PROFILES).default('none'),
    scenario: scenarioSchema.default('normal'),
    minute: minuteSchema.default(30),
  })
  .strict();

/** Egress request contract (shared with web); defaults scenario to 'egress-surge'. */
export const egressRequestSchema = z
  .object({
    venueId: venueIdSchema,
    mode: enumFromConst(EGRESS_MODES),
    scenario: scenarioSchema.default('egress-surge'),
  })
  .strict();

/** Weather query contract (shared with web); defaults preset to 'clear-day' and minute to 30. */
export const weatherQuerySchema = z
  .object({
    preset: weatherPresetSchema.default('clear-day'),
    minute: minuteSchema.default(30),
  })
  .strict();

/** Incident report submission contract (shared with web); defaults minute to 30. */
export const incidentReportSchema = z
  .object({
    venueId: venueIdSchema,
    zoneId: z.string().trim().min(1).max(50).regex(NO_MARKUP),
    category: enumFromConst(INCIDENT_CATEGORIES),
    severity: enumFromConst(INCIDENT_SEVERITIES),
    summary: displayText(240),
    minute: minuteSchema.default(30),
  })
  .strict();

/** Entry-readiness facts contract (shared with web); all boolean flags required, no defaults. */
export const entryFactsSchema = z
  .object({
    venueId: venueIdSchema,
    ticketSource: enumFromConst(TICKET_SOURCES),
    transferConfirmed: z.boolean(),
    idPacked: z.boolean(),
    bagCompliant: z.boolean(),
  })
  .strict();

/** Assistant query contract (shared with web); defaults persona 'fan', literacyTier 'standard', scenario 'normal', minute 30. */
export const assistantQuerySchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1)
      .max(ASSISTANT_INPUT_MAX_CHARS, { message: 'Message is too long.' }),
    venueId: venueIdSchema,
    persona: z.enum(['fan', 'volunteer', 'organizer', 'staff']).default('fan'),
    language: z.string().trim().max(20).optional(),
    literacyTier: z.enum(['standard', 'easy', 'audioFirst']).default('standard'),
    scenario: scenarioSchema.default('normal'),
    minute: minuteSchema.default(30),
  })
  .strict();

/** Briefing request contract (shared with web); defaults windowMinutes 15, role 'organizer', scenario 'normal', minute 30. */
export const briefingRequestSchema = z
  .object({
    venueId: venueIdSchema,
    windowMinutes: z.number().int().min(5).max(60).default(15),
    role: z.enum(['organizer', 'volunteer']).default('organizer'),
    scenario: scenarioSchema.default('normal'),
    minute: minuteSchema.default(30),
  })
  .strict();

/** User bootstrap/restore contract (shared with web); defaults claimedPoints to 0 (API clamps it anti-minting). */
export const bootstrapSchema = z
  .object({
    displayName: displayText(DISPLAY_NAME_MAX_CHARS),
    venueId: venueIdSchema,
    sectionZoneId: z.string().trim().min(1).max(50).regex(NO_MARKUP),
    /** Client-claimed restore total — the API clamps it (anti-minting). */
    claimedPoints: z.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();

/** Mission claim contract (shared with web); minute is required (no default), commute/heat fields optional. */
export const missionClaimSchema = z
  .object({
    userId: z.string().trim().min(1).max(60).regex(NO_MARKUP),
    missionId: enumFromConst(MISSION_IDS),
    minute: minuteSchema,
    commuteMode: enumFromConst(COMMUTE_MODES).optional(),
    commuteDistanceKm: z.number().min(0).max(500).optional(),
    advisedLeaveMinute: minuteSchema.optional(),
    heatProtocolActive: z.boolean().optional(),
  })
  .strict();

/** Leaderboard query contract (shared with web); defaults scope to 'venue', other fields optional. */
export const leaderboardQuerySchema = z
  .object({
    scope: enumFromConst(LEADERBOARD_SCOPES).default('venue'),
    venueId: venueIdSchema.optional(),
    sectionZoneId: z.string().trim().max(50).regex(NO_MARKUP).optional(),
    userId: z.string().trim().max(60).regex(NO_MARKUP).optional(),
  })
  .strict();

/** Inferred types — the single type source consumed by api and web. */
/** Inferred crowd query type (from crowdQuerySchema). */
export type CrowdQuery = z.infer<typeof crowdQuerySchema>;
/** Inferred routing request type (from routingRequestSchema). */
export type RoutingRequest = z.infer<typeof routingRequestSchema>;
/** Inferred egress request type (from egressRequestSchema). */
export type EgressRequest = z.infer<typeof egressRequestSchema>;
/** Inferred weather query type (from weatherQuerySchema). */
export type WeatherQuery = z.infer<typeof weatherQuerySchema>;
/** Inferred incident report type (from incidentReportSchema). */
export type IncidentReport = z.infer<typeof incidentReportSchema>;
/** Inferred entry-facts input type (from entryFactsSchema). */
export type EntryFactsInput = z.infer<typeof entryFactsSchema>;
/** Inferred assistant query type (from assistantQuerySchema). */
export type AssistantQuery = z.infer<typeof assistantQuerySchema>;
/** Inferred briefing request type (from briefingRequestSchema). */
export type BriefingRequest = z.infer<typeof briefingRequestSchema>;
/** Inferred bootstrap request type (from bootstrapSchema). */
export type BootstrapRequest = z.infer<typeof bootstrapSchema>;
/** Inferred mission claim input type (from missionClaimSchema). */
export type MissionClaimInput = z.infer<typeof missionClaimSchema>;
/** Inferred leaderboard query type (from leaderboardQuerySchema). */
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

/** Every exported request schema, for the "all strict + all safe" invariant tests. */
export const ALL_REQUEST_SCHEMAS = {
  crowdQuerySchema,
  routingRequestSchema,
  egressRequestSchema,
  weatherQuerySchema,
  incidentReportSchema,
  entryFactsSchema,
  assistantQuerySchema,
  briefingRequestSchema,
  bootstrapSchema,
  missionClaimSchema,
  leaderboardQuerySchema,
} as const;
