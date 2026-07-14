# Google Services

> Rendered live at [`/google-services`](https://copa-copilot-web-767171449038.us-central1.run.app/google-services) and served by `GET /api/google/services`. One honest status vocabulary — `implemented` / `ready-with-key` / `planned` — identical across docs, code, UI and tests. The endpoint exposes env-var **names only**; `exposesSecretValues: false` is asserted by an integration test.

**Scorecard (0.1.0):** 15 services · 6 implemented · 5 ready-with-key · 4 planned · 10 product families.

> **AI routing:** all inference goes through the **llm-service proxy** (`https://llm.lehana.in`, OpenAI-compatible), which reaches Gemini (`gemini-3-flash`) on Google AI accounts. The app never calls a provider API directly — a platform cost/security rule. Auth is a service-to-service `X-Internal-Key` held in Secret Manager.

| Service | Status | Use in Copa Copilot | Fallback | Code |
|---|---|---|---|---|
| **Gemini (via llm-service)** | implemented | Function-calling assistant, ops briefings, incident drafting | DEMO_MODE deterministic replies from the same engines | `apps/api/src/services/llm-client.ts`, `assistant.ts` |
| **Cloud Run** | implemented | Hosts API + web, scale-to-zero, `us-central1` | local dev servers | `apps/*/Dockerfile`, `cloudbuild-*.yaml` |
| **Cloud Build** | implemented | Builds + deploys both images | local `docker build` | `cloudbuild-{api,web}.yaml`, `scripts/deploy.ps1` |
| **Artifact Registry** | implemented | Stores served images (`copa-copilot` repo) | local image cache | `cloudbuild-*.yaml` |
| **Cloud Logging** | implemented | Structured JSON logs (no `console.log`) | same lines to stdout | `apps/api/src/middleware/logger.ts` |
| **Secret Manager** | implemented | llm-service internal key mounted by reference, least-privilege IAM | local gitignored `.env` | `scripts/deploy.ps1` |
| **Maps JavaScript API** | ready-with-key | Perimeter station↔gate map | text directions from the venue registry | `apps/web` map page |
| **Routes API** | ready-with-key | Station↔stadium travel times for egress | deterministic registry estimates | `apps/api/src/services` |
| **Cloud Translation** | ready-with-key | Long-tail UI translation | 6-language catalog + Gemini in-conversation | `packages/core/src/i18n.ts` |
| **Cloud Text-to-Speech** | ready-with-key | Audio-first accessibility voices | browser `speechSynthesis` (state shown) | accessibility page |
| **Google Analytics 4** | ready-with-key | Feature-usage analytics | no-op without the id | `apps/web/app/layout.tsx` |
| **Firebase Authentication** | planned | Persistent fan identity | anonymous no-PII profiles | ARCHITECTURE.md |
| **Cloud Firestore** | planned | Durable store behind `UserStore` | in-memory store (drop-in interface) | `apps/api/src/services/store.ts` |
| **BigQuery** | planned | Historical crowd analytics | `simulateWindow()` replayable series | ARCHITECTURE.md |
| **Pub/Sub** | planned | Real digital-twin telemetry ingestion | seeded simulation over SSE | ARCHITECTURE.md |

## Activation walkthrough
1. Put the llm-service key in `apps/api/.env` (`LLM_INTERNAL_KEY=sk-…`, gitignored).
2. `pwsh scripts/deploy.ps1 -ProjectId event-manager-promptwars` — pushes the key to Secret Manager, mounts it, flips `DEMO_MODE=false`.
3. The assistant then answers via Gemini through llm-service, grounded in the same `VERIFIED_STADIUM_DATA`; on any upstream failure it degrades to the deterministic path automatically.

**Live now:** the production deployment runs with `DEMO_MODE=false` — `/api/assistant/query` returns `engine: "gemini"`.

## Free-tier note
Gemini free tier (Flash), Cloud Run (2M req/mo), Firestore (1 GiB, 50K reads/day) and Maps per-SKU caps all comfortably cover a hackathon demo — the deployment runs at ~$0.
