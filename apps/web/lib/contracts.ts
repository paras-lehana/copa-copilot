// contracts.ts — response schemas the browser validates API replies against.
// These describe the SHAPES the API returns (which wrap @copa/core types). Keeping
// them as zod means the client fails loudly on drift instead of casting blindly.

import { z } from 'zod';

export const zoneStatusSchema = z.enum(['comfortable', 'busy', 'critical']);

export const zoneCrowdSchema = z.object({
  zoneId: z.string(),
  name: z.string(),
  kind: z.string(),
  densityPct: z.number(),
  status: zoneStatusSchema,
  queueMinutes: z.number(),
});

export const transitLoadSchema = z.object({
  name: z.string(),
  mode: z.string(),
  utilizationPct: z.number(),
  waitMinutes: z.number(),
  status: zoneStatusSchema,
});

export const crowdResponseSchema = z.object({
  snapshot: z.object({
    venueId: z.string(),
    minute: z.number(),
    phase: z.string(),
    scenario: z.string(),
    zones: z.array(zoneCrowdSchema),
    transit: z.array(transitLoadSchema),
  }),
});

export const venuesResponseSchema = z.object({
  venues: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      city: z.string(),
      country: z.string(),
      capacity: z.number(),
      climateControlled: z.boolean(),
      flagship: z.boolean(),
    }),
  ),
});

export const routeResponseSchema = z.object({
  route: z.object({
    fromZoneId: z.string(),
    toZoneId: z.string(),
    legs: z.array(
      z.object({
        fromZoneId: z.string(),
        toZoneId: z.string(),
        toZoneName: z.string(),
        meters: z.number(),
        stepFree: z.boolean(),
        zoneStatus: zoneStatusSchema,
        instruction: z.string(),
      }),
    ),
    totalMeters: z.number(),
    etaMinutes: z.number(),
    risk: z.enum(['safe', 'caution', 'unavoidable-critical']),
    explanation: z.string(),
  }),
});

export const egressResponseSchema = z.object({
  advice: z.object({
    venueId: z.string(),
    mode: z.string(),
    bestOption: z.object({
      leaveAtMinute: z.number(),
      projectedExitMinutes: z.number(),
      hubStatus: zoneStatusSchema,
    }),
    options: z.array(
      z.object({
        leaveAtMinute: z.number(),
        projectedExitMinutes: z.number(),
        hubStatus: zoneStatusSchema,
      }),
    ),
    minutesSavedVsFullTime: z.number(),
    explanation: z.string(),
  }),
});

export const weatherResponseSchema = z.object({
  protocol: z.object({
    venueId: z.string(),
    minute: z.number(),
    state: z.enum(['clear', 'lightning-watch', 'suspension', 'all-clear']),
    heatTier: z.enum(['normal', 'caution', 'cooling-breaks', 'extreme']),
    reading: z.object({
      minute: z.number(),
      nearestStrikeMiles: z.number(),
      heatIndexF: z.number(),
    }),
    suspendedUntilMinute: z.number().optional(),
    actions: z.object({
      fan: z.array(z.string()),
      volunteer: z.array(z.string()),
      organizer: z.array(z.string()),
      staff: z.array(z.string()),
    }),
  }),
});

export const entryResponseSchema = z.object({
  readiness: z.object({
    venueId: z.string(),
    ticketSource: z.string(),
    riskLevel: z.enum(['low', 'elevated', 'high']),
    readinessScore: z.number(),
    checklist: z.array(
      z.object({ id: z.string(), label: z.string(), done: z.boolean(), blocking: z.boolean() }),
    ),
    arrivalWindow: z.object({ fromMinute: z.number(), toMinute: z.number() }),
    guidance: z.array(z.string()),
  }),
});

export const assistantResponseSchema = z.object({
  reply: z.object({
    text: z.string(),
    language: z.string(),
    engine: z.enum(['demo', 'gemini']),
    toolTraces: z.array(
      z.object({ tool: z.string(), summary: z.string(), data: z.unknown() }),
    ),
  }),
});

export const briefingResponseSchema = z.object({
  briefing: z.object({
    venueId: z.string(),
    windowMinutes: z.number(),
    headline: z.string(),
    bullets: z.array(z.string()),
    topActions: z.array(z.string()),
    cached: z.boolean(),
    engine: z.enum(['demo', 'gemini']),
  }),
});

export const incidentCreatedSchema = z.object({
  incident: z.object({
    id: z.string(),
    venueId: z.string(),
    zoneId: z.string(),
    category: z.string(),
    severity: z.string(),
    summary: z.string(),
    status: z.string(),
    reportedAtMinute: z.number(),
  }),
});

export const incidentsResponseSchema = z.object({
  incidents: z.array(
    z.object({
      id: z.string(),
      venueId: z.string(),
      zoneId: z.string(),
      category: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      summary: z.string(),
      status: z.enum(['reported', 'triaged', 'dispatched', 'resolved']),
      reportedAtMinute: z.number(),
    }),
  ),
});

export const profileSchema = z.object({
  profile: z.object({
    userId: z.string(),
    displayName: z.string(),
    venueId: z.string(),
    sectionZoneId: z.string(),
    points: z.number(),
    kgCo2eSaved: z.number(),
    completedMissions: z.array(z.string()),
    level: z.number(),
  }),
});

export const missionsResponseSchema = z.object({
  missions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      metric: z.string(),
      basePoints: z.number(),
    }),
  ),
});

export const leaderboardResponseSchema = z.object({
  page: z.object({
    scope: z.string(),
    top: z.array(
      z.object({
        userId: z.string(),
        displayName: z.string(),
        points: z.number(),
        rank: z.number(),
        kgCo2eSaved: z.number(),
      }),
    ),
    aroundMe: z.array(
      z.object({
        userId: z.string(),
        displayName: z.string(),
        points: z.number(),
        rank: z.number(),
        kgCo2eSaved: z.number(),
      }),
    ),
    totalEntries: z.number(),
  }),
  greenestSections: z.array(
    z.object({ sectionZoneId: z.string(), totalKgCo2eSaved: z.number() }),
  ),
});

export const googleServicesResponseSchema = z.object({
  scorecard: z.object({
    totalServices: z.number(),
    implemented: z.number(),
    readyWithKey: z.number(),
    planned: z.number(),
    productFamilies: z.number(),
    exposesSecretValues: z.literal(false),
    exposesEnvVarNamesOnly: z.literal(true),
  }),
  services: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      family: z.string(),
      status: z.enum(['implemented', 'ready-with-key', 'planned']),
      purpose: z.string(),
      codePaths: z.array(z.string()),
      envVarNames: z.array(z.string()),
      fallbackMode: z.string(),
      evidenceSignals: z.array(z.string()),
      judgeProofPoints: z.array(z.string()),
    }),
  ),
  runtime: z.object({ geminiKeyPresent: z.boolean(), region: z.string() }),
});

export type CrowdResponse = z.infer<typeof crowdResponseSchema>;
export type RouteResponse = z.infer<typeof routeResponseSchema>;
export type WeatherResponse = z.infer<typeof weatherResponseSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
export type Profile = z.infer<typeof profileSchema>['profile'];
