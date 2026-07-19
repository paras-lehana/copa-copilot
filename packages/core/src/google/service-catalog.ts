// google/service-catalog.ts — evidence-as-code: the Google services contract.
// Boundary: one honest status vocabulary (implemented / ready-with-key / planned)
// used by docs, the /api/google/services endpoint, the /google-services page and
// the invariant tests. env var NAMES only — values never appear anywhere here.

/** Honesty tiers. `implemented` requires real code paths + a fallback mode. */
export type ServiceStatus = 'implemented' | 'ready-with-key' | 'planned';

/** One catalogued Google service. */
export interface GoogleService {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly status: ServiceStatus;
  /** What it does in Copa Copilot. */
  readonly purpose: string;
  /** Repo paths that back the claim. */
  readonly codePaths: readonly string[];
  /** Environment variable NAMES involved (never values). */
  readonly envVarNames: readonly string[];
  /** What happens with no key/config — every integration degrades gracefully. */
  readonly fallbackMode: string;
  /** Verifiable signals (endpoints, tests) that back the status. */
  readonly evidenceSignals: readonly string[];
  /** One-line proof points anyone can check. */
  readonly proofPoints: readonly string[];
}

export const GOOGLE_SERVICES: readonly GoogleService[] = [
  {
    id: 'gemini-api',
    name: 'Gemini (via llm-service)',
    family: 'Google AI',
    status: 'implemented',
    purpose:
      'Function-calling stadium assistant, operations briefings and incident drafting — Gemini reached through the llm-service proxy (never a direct provider call).',
    codePaths: ['apps/api/src/services/llm-client.ts', 'apps/api/src/services/assistant.ts', 'PROMPTS.md'],
    envVarNames: ['LLM_SERVICE_URL', 'LLM_ENDPOINT', 'LLM_MODEL', 'LLM_INTERNAL_KEY'],
    fallbackMode: 'DEMO_MODE deterministic replies computed by the same @copa/core engines.',
    evidenceSignals: ['POST /api/assistant/query answers with tool-grounded data', 'prompt-injection suite in tests'],
    proofPoints: ['Ask the assistant for a wheelchair route — the reply quotes live engine densities.'],
  },
  {
    id: 'cloud-run',
    name: 'Cloud Run',
    family: 'Compute',
    status: 'implemented',
    purpose: 'Hosts both services, scale-to-zero.',
    codePaths: ['apps/api/Dockerfile', 'apps/web/Dockerfile', 'cloudbuild-api.yaml', 'cloudbuild-web.yaml'],
    envVarNames: ['PORT'],
    fallbackMode: 'Local dev servers (npm run dev) — identical behaviour.',
    evidenceSignals: ['Live URLs in README respond', '/api/meta returns the tagged version'],
    proofPoints: ['curl the live /api/meta — version matches the README blockquote and git tag.'],
  },
  {
    id: 'cloud-build',
    name: 'Cloud Build',
    family: 'CI/CD',
    status: 'implemented',
    purpose: 'Builds and deploys both container images.',
    codePaths: ['cloudbuild-api.yaml', 'cloudbuild-web.yaml', 'scripts/deploy.ps1'],
    envVarNames: [],
    fallbackMode: 'Local docker build with the same Dockerfiles.',
    evidenceSignals: ['cloudbuild YAML at repo root'],
    proofPoints: ['One-command deploy script drives Cloud Build end to end.'],
  },
  {
    id: 'artifact-registry',
    name: 'Artifact Registry',
    family: 'CI/CD',
    status: 'implemented',
    purpose: 'Stores the built images the Cloud Run revisions serve.',
    codePaths: ['cloudbuild-api.yaml', 'scripts/deploy.ps1'],
    envVarNames: [],
    fallbackMode: 'Local image cache.',
    evidenceSignals: ['image tags reference <region>-docker.pkg.dev'],
    proofPoints: ['cloudbuild files push to the copa-copilot Artifact Registry repo.'],
  },
  {
    id: 'cloud-logging',
    name: 'Cloud Logging',
    family: 'Observability',
    status: 'implemented',
    purpose: 'Structured JSON request/error logs from the API (no console.log anywhere).',
    codePaths: ['apps/api/src/middleware/logger.ts'],
    envVarNames: [],
    fallbackMode: 'Same structured lines to stdout locally.',
    evidenceSignals: ['logger tests assert redaction (no user text, no upstream bodies, no env values)'],
    proofPoints: ['Logger middleware emits Cloud-Logging-shaped JSON with a PII-redaction contract.'],
  },
  {
    id: 'secret-manager',
    name: 'Secret Manager',
    family: 'Security',
    status: 'implemented',
    purpose: 'Holds the llm-service internal key; mounted by reference with least-privilege IAM.',
    codePaths: ['scripts/deploy.ps1', 'SECURITY.md'],
    envVarNames: ['LLM_INTERNAL_KEY'],
    fallbackMode: 'Local gitignored .env (never committed).',
    evidenceSignals: ['deploy script creates/rotates the llm-internal-key secret', 'no key material in repo'],
    proofPoints: ['The key never enters an image, the repo, or viewer-visible env config.'],
  },
  {
    id: 'maps-js',
    name: 'Maps JavaScript API',
    family: 'Google Maps Platform',
    status: 'ready-with-key',
    purpose: 'Perimeter map: station ↔ gate approach around the venue.',
    codePaths: ['apps/web/components/PerimeterMap.tsx'],
    envVarNames: ['NEXT_PUBLIC_MAPS_API_KEY'],
    fallbackMode: 'Text directions panel from the venue transit registry.',
    evidenceSignals: ['typed wrapper renders fallback panel when the key is absent'],
    proofPoints: ['Add a Maps key and the perimeter widget lights up; without one the UX still works.'],
  },
  {
    id: 'routes-api',
    name: 'Routes API',
    family: 'Google Maps Platform',
    status: 'ready-with-key',
    purpose: 'Station↔stadium travel times feeding the exit-wave advisor.',
    codePaths: ['apps/api/src/services/maps-client.ts'],
    envVarNames: ['MAPS_API_KEY'],
    fallbackMode: 'Deterministic estimates from the venue transit registry.',
    evidenceSignals: ['injectable fetchFn wrapper + fallback tests'],
    proofPoints: ['maps-client has the full request shape wired; only the key is absent.'],
  },
  {
    id: 'cloud-translation',
    name: 'Cloud Translation',
    family: 'AI/Language',
    status: 'ready-with-key',
    purpose: 'Long-tail UI string translation beyond the six built-in languages.',
    codePaths: ['packages/core/src/i18n.ts'],
    envVarNames: ['TRANSLATION_API_KEY'],
    fallbackMode: 'Six-language typed string catalog + Gemini in-conversation translation.',
    evidenceSignals: ['language registry with honest browserTtsCommon flags'],
    proofPoints: ['Assistant already answers in 6 languages including RTL Arabic without the API.'],
  },
  {
    id: 'cloud-tts',
    name: 'Cloud Text-to-Speech',
    family: 'AI/Language',
    status: 'ready-with-key',
    purpose: 'Audio-first accessibility mode voices.',
    codePaths: ['apps/web/components/AudioFirstToggle.tsx'],
    envVarNames: ['TTS_API_KEY'],
    fallbackMode: 'Browser speechSynthesis where available — the UI shows which engine is speaking.',
    evidenceSignals: ['honesty rule: fallback state exposed, never faked'],
    proofPoints: ['Audio-first tier caps sentences at 12 words — tested in the prompt suite.'],
  },
  {
    id: 'firebase-auth',
    name: 'Firebase Authentication',
    family: 'Firebase',
    status: 'planned',
    purpose: 'Persistent fan identity across matchdays.',
    codePaths: ['ARCHITECTURE.md'],
    envVarNames: [],
    fallbackMode: 'Anonymous local profiles — no PII by design for the demo.',
    evidenceSignals: ['UserStore interface is auth-ready (userId-keyed)'],
    proofPoints: ['Privacy-by-design demo: no PII collected, biometric-free.'],
  },
  {
    id: 'firestore',
    name: 'Cloud Firestore',
    family: 'Firebase',
    status: 'planned',
    purpose: 'Durable store behind the UserStore interface.',
    codePaths: ['apps/api/src/services/store.ts', 'ARCHITECTURE.md'],
    envVarNames: [],
    fallbackMode: 'In-memory store with pagination-shaped call sites (drop-in swap).',
    evidenceSignals: ['store contract tests runnable against any implementation'],
    proofPoints: ['Swap = one adapter file; zero route changes (interface documented).'],
  },
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    family: 'Analytics',
    status: 'ready-with-key',
    purpose: 'Feature-usage analytics on the web app.',
    codePaths: ['apps/web/app/layout.tsx'],
    envVarNames: ['NEXT_PUBLIC_GA4_ID'],
    fallbackMode: 'No-op when the id is absent.',
    evidenceSignals: ['gtag bootstrap gated on the env id'],
    proofPoints: ['Zero-cost, zero-PII usage metrics one env var away.'],
  },
  {
    id: 'bigquery',
    name: 'BigQuery',
    family: 'Data',
    status: 'planned',
    purpose: 'Historical crowd analytics across matchdays.',
    codePaths: ['ARCHITECTURE.md'],
    envVarNames: [],
    fallbackMode: 'Deterministic simulateWindow() series replayable on demand.',
    evidenceSignals: ['data-flow diagram names the export path'],
    proofPoints: ['Simulation series are already table-shaped for a BigQuery sink.'],
  },
  {
    id: 'pubsub',
    name: 'Pub/Sub',
    family: 'Data',
    status: 'planned',
    purpose: 'Real digital-twin telemetry ingestion (Lenovo-twin-class feeds).',
    codePaths: ['ARCHITECTURE.md'],
    envVarNames: [],
    fallbackMode: 'Seeded simulation stream over SSE.',
    evidenceSignals: ['SSE stream endpoint mirrors the eventual subscriber shape'],
    proofPoints: ['The engine consumes snapshots — a Pub/Sub subscriber slots in front unchanged.'],
  },
];

/** Aggregate scorecard served by /api/google/services. */
export interface GoogleServicesScorecard {
  readonly totalServices: number;
  readonly implemented: number;
  readonly readyWithKey: number;
  readonly planned: number;
  readonly productFamilies: number;
  readonly exposesSecretValues: false;
  readonly exposesEnvVarNamesOnly: true;
}

/**
 * Compute the scorecard from the catalog (single source — docs quote this).
 *
 * @example
 * buildScorecard().implemented; // 6
 */
export function buildScorecard(): GoogleServicesScorecard {
  return {
    totalServices: GOOGLE_SERVICES.length,
    implemented: GOOGLE_SERVICES.filter((s) => s.status === 'implemented').length,
    readyWithKey: GOOGLE_SERVICES.filter((s) => s.status === 'ready-with-key').length,
    planned: GOOGLE_SERVICES.filter((s) => s.status === 'planned').length,
    productFamilies: new Set(GOOGLE_SERVICES.map((s) => s.family)).size,
    exposesSecretValues: false,
    exposesEnvVarNamesOnly: true,
  };
}
