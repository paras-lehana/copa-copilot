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

export const venueIdSchema = enumFromConst(VENUE_IDS);
export const scenarioSchema = enumFromConst(SCENARIOS);
export const weatherPresetSchema = enumFromConst(WEATHER_PRESETS);

/** Match-relative minute: gates open at -240 at the earliest; egress ends by +240. */
export const minuteSchema = z.number().int().min(-240).max(240);

export const crowdQuerySchema = z
  .object({
    scenario: scenarioSchema.default('normal'),
    minute: minuteSchema.default(30),
  })
  .strict();

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

export const egressRequestSchema = z
  .object({
    venueId: venueIdSchema,
    mode: enumFromConst(EGRESS_MODES),
    scenario: scenarioSchema.default('egress-surge'),
  })
  .strict();

export const weatherQuerySchema = z
  .object({
    preset: weatherPresetSchema.default('clear-day'),
    minute: minuteSchema.default(30),
  })
  .strict();

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

export const entryFactsSchema = z
  .object({
    venueId: venueIdSchema,
    ticketSource: enumFromConst(TICKET_SOURCES),
    transferConfirmed: z.boolean(),
    idPacked: z.boolean(),
    bagCompliant: z.boolean(),
  })
  .strict();

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

export const briefingRequestSchema = z
  .object({
    venueId: venueIdSchema,
    windowMinutes: z.number().int().min(5).max(60).default(15),
    role: z.enum(['organizer', 'volunteer']).default('organizer'),
    scenario: scenarioSchema.default('normal'),
    minute: minuteSchema.default(30),
  })
  .strict();

export const bootstrapSchema = z
  .object({
    displayName: displayText(DISPLAY_NAME_MAX_CHARS),
    venueId: venueIdSchema,
    sectionZoneId: z.string().trim().min(1).max(50).regex(NO_MARKUP),
    /** Client-claimed restore total — the API clamps it (anti-minting). */
    claimedPoints: z.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();

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

export const leaderboardQuerySchema = z
  .object({
    scope: enumFromConst(LEADERBOARD_SCOPES).default('venue'),
    venueId: venueIdSchema.optional(),
    sectionZoneId: z.string().trim().max(50).regex(NO_MARKUP).optional(),
    userId: z.string().trim().max(60).regex(NO_MARKUP).optional(),
  })
  .strict();

/** Inferred types — the single type source consumed by api and web. */
export type CrowdQuery = z.infer<typeof crowdQuerySchema>;
export type RoutingRequest = z.infer<typeof routingRequestSchema>;
export type EgressRequest = z.infer<typeof egressRequestSchema>;
export type WeatherQuery = z.infer<typeof weatherQuerySchema>;
export type IncidentReport = z.infer<typeof incidentReportSchema>;
export type EntryFactsInput = z.infer<typeof entryFactsSchema>;
export type AssistantQuery = z.infer<typeof assistantQuerySchema>;
export type BriefingRequest = z.infer<typeof briefingRequestSchema>;
export type BootstrapRequest = z.infer<typeof bootstrapSchema>;
export type MissionClaimInput = z.infer<typeof missionClaimSchema>;
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
