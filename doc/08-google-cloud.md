# Google Cloud & Gemini Integration — Copa Copilot

Copa Copilot runs entirely on Google Cloud and reaches Google's generative
models for its conversational features. This document describes the integration
model for each Google service the product uses, the honest status vocabulary
that governs how those integrations are described, and the evidence-as-code
service catalogue that publishes those claims in a form anyone can verify.

The canonical source of truth is a single TypeScript module,
[`packages/core/src/google/service-catalog.ts`](../packages/core/src/google/service-catalog.ts),
which is consumed by the docs, the `GET /api/google/services` endpoint, the
`/google-services` web page, and a set of invariant tests. There is one
catalogue and one status vocabulary; the documentation quotes it rather than
paraphrasing it.

Related reading:

- [AI Assistant & Grounding Design](./03-ai-assistant.md) — how Gemini is
  prompted, grounded, and fenced against injection.
- [Deployment & Operations](./09-deployment.md) — how Cloud Build, Artifact
  Registry, Cloud Run, and Secret Manager are wired into the release pipeline.
- [Security](./06-security.md) — the secret-management and redaction controls
  referenced throughout this file.
- [Architecture](./01-architecture.md) — the monorepo layout and the
  interface seams that the `planned` services are designed to slot into.

---

## 1. The integration model

### 1.1 Gemini is reached through the llm-service proxy

Copa Copilot never calls a model-provider API directly. All inference is routed
through the **llm-service proxy** at `https://llm.lehana.in`, an
OpenAI-compatible endpoint that in turn reaches **Gemini (`gemini-3-flash`)** on
Google AI accounts. Routing every model call through the proxy is a deliberate
platform rule: it keeps provider credentials and cost controls on one
server-side surface instead of scattering keys across application code.

Authentication to the proxy is a service-to-service `X-Internal-Key` header. The
key value is held in Secret Manager and mounted into the API runtime by
reference; it is never embedded in an image, committed to the repository, or
exposed in any client-visible configuration. The client that performs the call
is [`apps/api/src/services/llm-client.ts`](../apps/api/src/services/llm-client.ts),
and the assistant logic that consumes it is
[`apps/api/src/services/assistant.ts`](../apps/api/src/services/assistant.ts).

The environment variables that configure this path are, by name only:

```
LLM_SERVICE_URL   # proxy base URL (https://llm.lehana.in)
LLM_ENDPOINT      # OpenAI-compatible route
LLM_MODEL         # gemini-3-flash
LLM_INTERNAL_KEY  # service-to-service key — value lives in Secret Manager
```

When no key is configured, or when the product runs in `DEMO_MODE`, the
assistant produces deterministic replies from the same `@copa/core` engines that
back the live path. The production deployment runs with `DEMO_MODE=false`, so
`POST /api/assistant/query` returns `engine: "gemini"`; on any upstream failure
it falls back automatically to the deterministic path. The grounding contract,
the injection boundary, and the fallback behaviour are detailed in
[AI Assistant & Grounding Design](./03-ai-assistant.md).

### 1.2 Hosting and delivery on Google Cloud

The two runtime services — the Express 4 API and the Next.js 15 web app — are
both containerised and hosted on **Cloud Run** in region `us-central1` under GCP
project `copa-copilot-prod` (project number `767171449038`). Both run
scale-to-zero with `--max-instances=3`. The container images are built by
**Cloud Build** from the multi-stage, non-root, digest-pinned Dockerfiles at
`apps/api/Dockerfile` and `apps/web/Dockerfile`, and stored in **Artifact
Registry** in a repository named `copa-copilot`. Structured request and error
logs flow to **Cloud Logging**, and the one runtime secret is held in **Secret
Manager**.

The build files and the one-command deploy script live at the repository root:

```
cloudbuild-api.yaml
cloudbuild-web.yaml
scripts/deploy.ps1
```

The full build-and-release flow, environment configuration, and observability
are covered in [Deployment & Operations](./09-deployment.md).

---

## 2. The honest status vocabulary

Every catalogued service carries exactly one of three statuses. The vocabulary
is defined once, as a TypeScript union in
[`service-catalog.ts`](../packages/core/src/google/service-catalog.ts):

```ts
export type ServiceStatus = 'implemented' | 'ready-with-key' | 'planned';
```

| Status | Meaning | Requirement |
|---|---|---|
| `implemented` | The service is wired into a real code path that runs in production, with a graceful fallback mode. | Real code paths **and** a documented fallback. |
| `ready-with-key` | The integration code exists (a typed client or gated bootstrap) and works the moment a key or id is supplied; without it the product degrades to a documented alternative. | Client code present; only a credential is missing. |
| `planned` | The service is a designed extension point. An interface seam exists so it can be adopted without rewriting call sites, but no live integration is present. | An interface/seam and a fallback; no live call. |

The reason this vocabulary exists is honesty under audit. It would be easy to
list every Google product the architecture *could* use and imply they are all
live. Instead, the catalogue distinguishes what actually runs in production
(`implemented`) from what is one credential away (`ready-with-key`) from what is
an intentional future seam (`planned`). Each row also names a `fallbackMode`,
so no integration is presented as mandatory: the product runs fully with zero
API keys, and every optional integration degrades to a real, working
alternative rather than a broken screen.

---

## 3. Evidence-as-code: the service catalogue

### 3.1 One catalogue, four consumers

The catalogue is a single, typed, read-only array of `GoogleService` records.
Each record is a self-contained claim with the evidence attached:

```ts
export interface GoogleService {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly status: ServiceStatus;
  readonly purpose: string;         // what it does in Copa Copilot
  readonly codePaths: readonly string[];   // repo paths that back the claim
  readonly envVarNames: readonly string[]; // env var NAMES only — never values
  readonly fallbackMode: string;    // behaviour with no key/config
  readonly evidenceSignals: readonly string[]; // endpoints/tests backing status
  readonly proofPoints: readonly string[];     // one-line checks anyone can run
}
```

The same array is rendered four ways:

1. **Documentation** — this file and `GOOGLE_SERVICES.md` quote it.
2. **API** — `GET /api/google/services` serves the catalogue plus an aggregate
   scorecard.
3. **Web** — the `/google-services` page renders the catalogue for readers.
   Live at
   `https://copa-copilot-web-767171449038.us-central1.run.app/google-services`.
4. **Tests** — honesty-invariant tests assert the catalogue's guarantees.

Because there is one source, the counts, statuses, env-var names, and fallback
descriptions cannot drift between the docs, the running API, and the UI.

### 3.2 The scorecard is computed, not hand-written

The aggregate figures are derived from the catalogue at call time by
`buildScorecard()`, so they are always consistent with the rows:

```ts
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
```

For the current catalogue this yields:

| Metric | Value |
|---|---|
| Total services | **15** |
| Implemented | **6** |
| Ready-with-key | **5** |
| Planned | **4** |
| Product families | **10** |
| Exposes secret values | **false** |
| Exposes env-var names only | **true** |

### 3.3 Env-var names only; secret values never appear

Every field in a `GoogleService` record is safe to publish. The `envVarNames`
field carries the **names** of environment variables (for example
`LLM_INTERNAL_KEY`, `NEXT_PUBLIC_MAPS_API_KEY`, `TTS_API_KEY`) so a reader can
see what configuration a service needs — but never a value. The scorecard's
`exposesSecretValues: false` is not a comment; it is a property served by the
endpoint and asserted by an integration test, so any regression that leaked a
value into the catalogue payload would fail CI. This is the same secret-handling
posture described in [Security](./06-security.md): the llm-service key lives
server-side in Secret Manager, is passed only via the `X-Internal-Key` header,
and is excluded from logs by the redaction contract in
[`apps/api/src/middleware/logger.ts`](../apps/api/src/middleware/logger.ts).

---

## 4. Catalogued services

The full catalogue is fifteen services across ten product families. The tables
below reproduce it grouped by status, preserving the order in
[`service-catalog.ts`](../packages/core/src/google/service-catalog.ts).

### 4.1 Implemented (6) — live in production

| Service | Family | Purpose in Copa Copilot | Fallback | Backing code |
|---|---|---|---|---|
| **Gemini (via llm-service)** | Google AI | Function-calling stadium assistant, operations briefings, incident drafting — reached through the llm-service proxy, never a direct provider call. | `DEMO_MODE` deterministic replies from the same `@copa/core` engines. | `apps/api/src/services/llm-client.ts`, `assistant.ts`, `PROMPTS.md` |
| **Cloud Run** | Compute | Hosts both the API and the web app, scale-to-zero in `us-central1`. | Local dev servers (`npm run dev`), identical behaviour. | `apps/api/Dockerfile`, `apps/web/Dockerfile`, `cloudbuild-*.yaml` |
| **Cloud Build** | CI/CD | Builds and deploys both container images. | Local `docker build` with the same Dockerfiles. | `cloudbuild-api.yaml`, `cloudbuild-web.yaml`, `scripts/deploy.ps1` |
| **Artifact Registry** | CI/CD | Stores the images the Cloud Run revisions serve (`copa-copilot` repo). | Local image cache. | `cloudbuild-api.yaml`, `scripts/deploy.ps1` |
| **Cloud Logging** | Observability | Structured JSON request/error logs from the API (no `console.log`). | Same structured lines to stdout locally. | `apps/api/src/middleware/logger.ts` |
| **Secret Manager** | Security | Holds the llm-service internal key, mounted by reference with least-privilege IAM. | Local gitignored `.env`, never committed. | `scripts/deploy.ps1`, `SECURITY.md` |

The six implemented services are exactly the set that runs in the live
deployment: `Gemini (via llm-service)`, `Cloud Run`, `Cloud Build`,
`Artifact Registry`, `Cloud Logging`, and `Secret Manager`.

### 4.2 Ready-with-key (5) — one credential from live

| Service | Family | Purpose in Copa Copilot | Fallback | Env var (name only) |
|---|---|---|---|---|
| **Maps JavaScript API** | Google Maps Platform | Perimeter map: station ↔ gate approach around the venue. | Text directions panel from the venue transit registry. | `NEXT_PUBLIC_MAPS_API_KEY` |
| **Routes API** | Google Maps Platform | Station ↔ stadium travel times feeding the exit-wave advisor. | Deterministic estimates from the venue transit registry. | `MAPS_API_KEY` |
| **Cloud Translation** | AI/Language | Long-tail UI string translation beyond the six built-in languages. | Six-language typed catalog + Gemini in-conversation translation. | `TRANSLATION_API_KEY` |
| **Cloud Text-to-Speech** | AI/Language | Audio-first accessibility mode voices. | Browser `speechSynthesis`; the UI shows which engine is speaking. | `TTS_API_KEY` |
| **Google Analytics 4** | Analytics | Feature-usage analytics on the web app. | No-op when the id is absent. | `NEXT_PUBLIC_GA4_ID` |

Each of these has real code that becomes active the moment a credential is
present. For example,
[`apps/api/src/services/maps-client.ts`](../apps/api/src/services/maps-client.ts)
carries the full Routes API request shape with an injectable `fetchFn` wrapper
and fallback tests; only the key is absent. The Text-to-Speech integration
follows the product's honesty rule for fallbacks — the audio-first UI exposes
which speech engine is active rather than pretending a cloud voice is present.

### 4.3 Planned (4) — designed extension seams

| Service | Family | Purpose in Copa Copilot | Fallback | Seam |
|---|---|---|---|---|
| **Firebase Authentication** | Firebase | Persistent fan identity across matchdays. | Anonymous local profiles — no PII by design for the demo. | `UserStore` interface is auth-ready (`userId`-keyed). |
| **Cloud Firestore** | Firebase | Durable store behind the `UserStore` interface. | In-memory store with pagination-shaped call sites (drop-in swap). | `apps/api/src/services/store.ts` |
| **BigQuery** | Data | Historical crowd analytics across matchdays. | Deterministic `simulateWindow()` series, replayable on demand. | Data-flow diagram names the export path. |
| **Pub/Sub** | Data | Real digital-twin telemetry ingestion. | Seeded simulation stream over SSE. | SSE stream endpoint mirrors the eventual subscriber shape. |

The `planned` rows are not aspirational placeholders; each names a concrete
interface seam in the codebase. Adopting Firestore, for instance, is described
as a single adapter file behind the documented `UserStore` interface, with zero
route changes. These seams are described further in
[Architecture](./01-architecture.md) and `ARCHITECTURE.md`.

---

## 5. Honesty-invariant tests

The catalogue's guarantees are enforced by the API integration suite, not by
convention. The relevant invariants that `GET /api/google/services` must uphold
include:

- **No secret values.** The served payload asserts
  `exposesSecretValues: false`; a test confirms that no environment-variable
  *value* appears anywhere in the response — only names.
- **Computed counts match the catalogue.** The scorecard is derived from
  `GOOGLE_SERVICES` at request time, so the served totals (15 / 6 / 5 / 4 and
  10 families) always reflect the actual rows. A row added, removed, or
  re-statused updates the served figures automatically.
- **Status vocabulary is closed.** Every row's `status` is one of the three
  union members; the TypeScript type makes any other value a compile error.
- **Fallback is mandatory.** Each `implemented` and `ready-with-key` service
  documents a `fallbackMode`, reflecting the product-wide rule that no
  integration is a hard dependency.

These tests are part of the API integration layer (160 integration tests within
a total suite of 1,605). The redaction guarantees they rely on are shared with
the logging and error-envelope controls documented in
[Security](./06-security.md) and [Testing Strategy](./05-testing.md).

---

## 6. Activation walkthrough

Moving from the deterministic demo path to live Gemini is a two-step operation,
documented in `GOOGLE_SERVICES.md`:

1. Put the llm-service key in `apps/api/.env` as `LLM_INTERNAL_KEY=…` (the file
   is gitignored and never committed).
2. Run the deploy script, which pushes the key to Secret Manager, mounts it into
   the Cloud Run revision by reference, and flips `DEMO_MODE=false`:

   ```powershell
   pwsh scripts/deploy.ps1 -ProjectId copa-copilot-prod
   ```

After deployment the assistant answers via Gemini through llm-service, grounded
in the same `VERIFIED_STADIUM_DATA` the demo path uses, and degrades
automatically to the deterministic path on any upstream failure. The production
deployment already runs this way: `/api/assistant/query` returns
`engine: "gemini"`.

The `ready-with-key` services activate the same way — supply the named
environment variable (a Maps key, a GA4 id, a Translation or TTS key) and the
corresponding code path lights up. Until then, each falls back to a real,
working alternative, and the catalogue continues to report the honest status.

---

## 7. Cost posture

Every implemented and ready-with-key integration sits within Google Cloud
free-tier allowances for a demonstration workload: Gemini Flash on the free
tier, Cloud Run's monthly request allowance, Firestore's free quota, and
per-SKU Maps caps. Combined with Cloud Run scale-to-zero and
`--max-instances=3`, the deployment operates at approximately zero cost while
idle. This keeps the "runs fully with zero API keys" property practical rather
than theoretical: the product is inexpensive to run with keys, and free to run
without them.
