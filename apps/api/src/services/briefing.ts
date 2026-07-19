// briefing.ts — the AI Operations Briefing with a per-(venue,window) TTL cache.
// Efficiency: briefings aggregate a whole window of engine data; the cache keeps
// repeated dashboard clicks from re-paying aggregation (and Gemini calls in live
// mode). The response carries a `cached` flag so the UI can say so honestly.

import {
  type BriefingRequest,
  evaluateWeatherProtocol,
  seedIncidents,
  simulateWindow,
  sustainabilityTiles,
  triageQueue,
} from '@copa/core';
import { type AppConfig, hasLlmKey } from '../config';
import { llmComplete } from './llm-client';

/** The briefing payload. */
export interface OpsBriefing {
  readonly venueId: string;
  readonly windowMinutes: number;
  readonly headline: string;
  readonly bullets: readonly string[];
  readonly topActions: readonly string[];
  readonly cached: boolean;
  readonly engine: 'demo' | 'gemini';
}

interface CacheSlot {
  readonly briefing: OpsBriefing;
  readonly expiresAtMs: number;
}

/** Cache TTL — briefings age out with the data they summarise. */
export const BRIEFING_CACHE_TTL_MS = 60_000;

const cache = new Map<string, CacheSlot>();

/** Test hook: clear the cache between suites. */
export function clearBriefingCache(): void {
  cache.clear();
}

/** Deterministic aggregation the briefing (and Gemini grounding) is built from. */
export function aggregateWindow(request: BriefingRequest, seed: number) {
  const from = request.minute - request.windowMinutes;
  const series = simulateWindow(request.venueId, seed, from, request.minute, 5, request.scenario);
  const latest = series[series.length - 1];
  const critical = latest === undefined ? [] : latest.zones.filter((z) => z.status === 'critical');
  const busy = latest === undefined ? [] : latest.zones.filter((z) => z.status === 'busy');
  const incidents = triageQueue(seedIncidents(request.venueId, request.minute - 10), latest);
  const weather = evaluateWeatherProtocol(request.venueId, 'heat-dome', request.minute, seed);
  const tiles = sustainabilityTiles(request.venueId, request.minute, seed);
  return { series, latest, critical, busy, incidents, weather, tiles };
}

function composeDemoBriefing(request: BriefingRequest, seed: number): OpsBriefing | undefined {
  const agg = aggregateWindow(request, seed);
  if (agg.latest === undefined) return undefined;

  const headline =
    agg.critical.length > 0
      ? `${agg.critical.length} zone(s) critical, ${agg.busy.length} busy — phase: ${agg.latest.phase}.`
      : `No critical zones; ${agg.busy.length} busy — phase: ${agg.latest.phase}.`;

  const bullets = [
    ...agg.critical.map((z) => `${z.name} at ${z.densityPct}% — critical.`),
    ...(agg.incidents[0] === undefined
      ? []
      : [`Top incident: [${agg.incidents[0].severity}] ${agg.incidents[0].summary}`]),
    ...(agg.weather === undefined || agg.weather.heatTier === 'normal'
      ? []
      : [`Heat tier ${agg.weather.heatTier} (heat index ${agg.weather.reading.heatIndexF}°F).`]),
    ...(agg.tiles === undefined ? [] : [`Sustainability: ${agg.tiles.wasteDivertedPct}% waste diverted, ${agg.tiles.waterRefills} refills.`]),
  ];

  const topActions = [
    ...(agg.critical.length > 0
      ? [`Redirect flows away from ${agg.critical[0]?.name ?? 'the critical zone'} via adjacent concourses.`]
      : ['Maintain current gate configuration.']),
    ...(agg.incidents.length > 0 ? ['Work the incident queue in triage order.'] : []),
    ...(agg.weather !== undefined && agg.weather.heatTier !== 'normal'
      ? ['Activate the heat-tier actions for all four personas.']
      : []),
  ].slice(0, 3);

  return {
    venueId: request.venueId,
    windowMinutes: request.windowMinutes,
    headline,
    bullets,
    topActions,
    cached: false,
    engine: 'demo',
  };
}

/**
 * Produce (or serve from cache) the operations briefing. Live mode asks Gemini to
 * tighten the demo composition; failures degrade to the deterministic version.
 */
export async function produceBriefing(
  request: BriefingRequest,
  config: AppConfig,
): Promise<OpsBriefing | undefined> {
  const key = `${request.venueId}:${request.scenario}:${request.minute}:${request.windowMinutes}:${request.role}`;
  const nowMs = config.now().getTime();
  const hit = cache.get(key);
  if (hit !== undefined && hit.expiresAtMs > nowMs) {
    return { ...hit.briefing, cached: true };
  }

  const demo = composeDemoBriefing(request, config.simSeed);
  if (demo === undefined) return undefined;

  let briefing = demo;
  if (!config.demoMode && hasLlmKey(config)) {
    const live = await llmComplete(
      {
        baseUrl: config.llmServiceUrl,
        endpoint: config.llmEndpoint,
        internalKey: config.llmInternalKey,
        model: config.llmModel,
      },
      `You are the operations-briefing writer for a FIFA World Cup 2026 stadium command room. Rewrite the following verified aggregation as a crisp briefing for a ${request.role}: one headline sentence, then up to 5 bullets, then exactly 3 prioritized actions. Use ONLY the numbers provided. Maximum 150 words.`,
      JSON.stringify({ headline: demo.headline, bullets: demo.bullets, topActions: demo.topActions }),
    );
    if (live.ok) {
      // Honest-label boundary: Gemini rewrites ONLY the human-facing headline prose.
      // The bullets and prioritized actions stay exactly as the deterministic engine
      // produced them — every number remains grounded and reproducible. `engine:'gemini'`
      // therefore means "headline authored by Gemini", not "figures invented by Gemini".
      briefing = { ...demo, headline: live.value.split('\n')[0] ?? demo.headline, engine: 'gemini' };
    }
  }

  cache.set(key, { briefing, expiresAtMs: nowMs + BRIEFING_CACHE_TTL_MS });
  return briefing;
}
