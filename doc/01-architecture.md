# System Architecture — Copa Copilot

Copa Copilot is a GenAI smart-stadium operations and fan copilot built for all 16
FIFA World Cup 2026 venues. It gives fans, organizers, volunteers, and venue staff a
conversational, multilingual copilot grounded in a deterministic stadium engine that
simulates live crowd, transit, weather, egress, entry, and sustainability conditions.
This document describes how the system is structured: the monorepo and its three
packages, the deterministic-core principle that makes every output reproducible, the
request/response data flow from the web app through the API to the domain engines, the
shared zod contracts, and the typed error model.

For product context and personas, see the [Introduction](./00-introduction.md). For the
domain concepts the engine reasons over — venues, zones, scenarios, seeds — see the
[Domain Model & Determinism](./11-domain-model.md) document.

---

## 1. Architectural overview

The system is a TypeScript-strict [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces)
monorepo with a strict, one-directional dependency graph. Three packages divide the
responsibilities cleanly:

| Package | Location | Role | Runtime |
|---|---|---|---|
| `@copa/core` | `packages/core` | Pure deterministic domain engine — simulation, routing, protocols, gamification, schemas, error taxonomy | None (library; `zod` is the only runtime dependency) |
| `@copa/api` | `apps/api` | Express 4 REST API — validation, rate limiting, logging, LLM proxying, endpoint handlers | Cloud Run |
| `@copa/web` | `apps/web` | Next.js App Router web app — fan, organizer, volunteer, and accessibility experiences | Cloud Run |

All three packages are pinned to version `0.2.0` (the value `GET /api/meta` returns);
the latest git tag is `v0.4.0`. The workspace root is declared in `package.json`:

```json
"workspaces": [
  "packages/core",
  "apps/api",
  "apps/web"
]
```

The dependency rule is absolute and enforced by the package manifests: **`@copa/web` and
`@copa/api` both depend on `@copa/core`; `@copa/core` depends on nothing but `zod`; and
`@copa/core` never imports an app.** This keeps the domain logic pure, portable, and
independently testable.

```
apps/web  (Next.js 15 / React 19, Cloud Run)  ─┐
                                                ├─▶  @copa/core   (zod only; no I/O, no clock, no RNG)
apps/api  (Express 4, Cloud Run)              ─┘
```

Because the engine has no I/O, no clock, and no randomness, both apps get identical
results from identical inputs, and the entire domain layer can be exercised in unit tests
without spinning up a server, a browser, or a network.

---

## 2. The three packages

### 2.1 `@copa/core` — the deterministic engine

`@copa/core` is a pure domain library. Its manifest lists exactly one runtime dependency:

```json
"dependencies": {
  "zod": "^3.24.0"
}
```

A zero-runtime-dependency core (beyond `zod`) means a tiny install, fast cold starts on
Cloud Run, and nothing to audit at runtime. The package compiles to `dist/index.js` with
type declarations at `dist/index.d.ts`, and `packages/core/src/index.ts` is the barrel
that re-exports every public module.

The core is organized as one file per bounded concern. The modules are:

| Module | Responsibility |
|---|---|
| `prng.ts` | Seeded deterministic PRNG (replaces `Math.random`) |
| `result.ts` | `Result<T, AppError>` channel |
| `errors.ts` | `AppError` taxonomy and safe, localized messages |
| `i18n.ts` | Six-language BCP-47 locale resolution |
| `venues.ts` | 16-venue registry (zones, gates, roof/climate flag, transit links) |
| `stadium-graph.ts` | Per-venue stadium navigation graphs |
| `crowd.ts` | Seeded crowd / queue / transit simulation |
| `routing.ts` | Crowd- and accessibility-aware safest route (linear-scan Dijkstra) |
| `egress.ts` | Exit-wave advisor (the anti-MetLife feature) |
| `weather.ts` | 8-mile lightning and heat-tier protocol state machine |
| `incidents.ts` | Incident triage and ordering |
| `entry.ts` | Entry-readiness / anti-ghost-ticket logic |
| `sustainability.ts` | Emission / CO2e math |
| `gamification.ts` | Missions and point math (including `clampRestoredPoints`) |
| `leaderboard.ts` | Leaderboard ordering |
| `schemas.ts` | The single shared zod schema source (with `safeErrorMap`) |
| `index.ts` | Package barrel |
| `a11y/wcag-catalog.ts` | Evidence-as-code WCAG catalogue (14 criteria) |
| `google/service-catalog.ts` | Evidence-as-code Google service catalogue (15 services) |

Two of these modules deserve special mention because they are consumed as data by both
apps rather than as behaviour: `a11y/wcag-catalog.ts` and `google/service-catalog.ts`
model conformance and integration status as typed, testable structures. See
[Accessibility](./07-accessibility.md) and
[Google Cloud & Gemini Integration](./08-google-cloud.md) respectively.

### 2.2 `@copa/api` — the Express service

`@copa/api` is an Express 4 application deployed to Cloud Run. Its manifest is deliberately
lean:

```json
"dependencies": {
  "@copa/core": "*",
  "express": "^4.21.0",
  "zod": "^3.24.0"
}
```

The API layer owns everything the pure engine must not: reading configuration from the
environment, request validation, rate limiting, structured logging, correlation IDs, and
proxying to the Gemini-backed `llm-service`. The application is constructed by a
`buildApp(config)` factory in `apps/api/src/server.ts`, which returns an Express app
without binding a port. This makes the whole API testable in-process with Supertest — no
live socket required — and keeps environment reads confined to a single configuration
seam rather than scattered across handlers.

The API exposes the following endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness probe |
| GET | `/api/meta` | Service metadata (version, engine) |
| GET | `/api/google/services` | Google service evidence catalogue |
| GET | `/api/venues` | 16-venue registry |
| GET | `/api/venues/:venueId` | Single venue detail |
| GET | `/api/crowd/:venueId` | Crowd / queue snapshot |
| GET | `/api/transit/:venueId` | Transit-load snapshot |
| POST | `/api/routing/recommend` | Crowd- and accessibility-aware route |
| POST | `/api/egress/advice` | Exit-wave advice |
| GET | `/api/egress/stagger/:venueId` | Staggered-egress plan |
| GET | `/api/weather/:venueId` | Weather-protocol state |
| POST | `/api/entry/assess` | Entry-readiness assessment |
| POST | `/api/incidents` | Create an incident |
| GET | `/api/incidents/:venueId` | List incidents for a venue |
| PATCH | `/api/incidents/:incidentId/advance` | Advance an incident's lifecycle |
| POST | `/api/assistant/query` | Conversational assistant query |
| POST | `/api/ops/briefing` | AI operations briefing |
| POST | `/api/users/bootstrap` | Create an anonymous local profile |
| GET | `/api/users/:userId` | Fetch a user profile |
| GET | `/api/missions` | List available missions |
| POST | `/api/missions/complete` | Complete a mission |
| GET | `/api/leaderboard` | Leaderboard standings |

Full request/response contracts, error codes, and rate limits are documented in the
[API Reference](./10-api-reference.md).

### 2.3 `@copa/web` — the Next.js app

`@copa/web` is a Next.js 15 App Router application on React 19, deployed to Cloud Run. Its
notable dependencies:

```json
"dependencies": {
  "@copa/core": "*",
  "framer-motion": "^12.0.0",
  "next": "^15.3.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0"
}
```

The web app renders ten routes — the dashboard, onboarding, map, assistant, ops,
volunteer, missions, leaderboard, accessibility, and Google-services pages. Crucially, the
web app **imports** the shared zod schemas from `@copa/core` rather than hand-mirroring the
API's input and output shapes. Its client-side API wrapper validates responses against the
same schema objects the API validated requests with, so the contract is defined exactly
once and drift between client and server is impossible. Styling is a single Tailwind CSS 4
system; animation is handled by Framer Motion, with reduced-motion honoured in both CSS and
motion configuration.

---

## 3. The deterministic-core principle

The single most important architectural decision in Copa Copilot is that **`@copa/core`
contains no `Date.now()` and no `Math.random()` anywhere.** Time — expressed as the match
minute — and a numeric seed are function parameters, not ambient state read from the
runtime.

Concretely, the module `prng.ts` supplies a seeded pseudo-random number generator that
replaces `Math.random()` throughout the engine, and every simulation function receives the
current match minute as an argument rather than consulting a system clock. The result is a
pure function of its inputs:

```
(venue, scenario, minute, seed)  →  deterministic snapshot
```

The same tuple always yields the same snapshot. This property has three consequences that
shape the rest of the system:

1. **Every number the UI shows is reproducible in a unit test.** A crowd-density figure, a
   queue time, a route length, a CO2e estimate, or a mission point total can be asserted
   against an exact expected value, because there is no nondeterminism to defeat the
   assertion.
2. **The demo is identical on every machine and every deploy.** With `DEMO_MODE` enabled,
   the entire product runs with zero API keys, producing the same replies everywhere,
   because those replies come from the same deterministic engines.
3. **End-to-end tests assert real values, not just visibility.** Playwright journeys can
   check that a specific value appears on screen rather than merely that "an element is
   visible," because the value is knowable ahead of time.

This determinism is the backbone of the test suite (1,351 core unit tests) and of the
honest engine labelling described in [Domain Model & Determinism](./11-domain-model.md).
Where the closed-form models in the engine trade a full discrete-event simulation for a
deterministic curve, that choice is deliberate and documented — the curves are
indistinguishable from a queue simulation at demo scale while remaining fully reproducible.

---

## 4. Request / response data flow

The runtime path for a user interaction runs strictly in one direction — web to API to
core — and returns a grounded, validated response back up the same path.

```
  ┌───────────────────────────────────────────────────────────────────────┐
  │  @copa/web  (Next.js App Router, React 19)                            │
  │    UI action ──▶ api-client (validates against @copa/core zod schema) │
  └───────────────────────────────┬───────────────────────────────────────┘
                                   │  HTTPS (JSON)
                                   ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │  @copa/api  (Express 4 on Cloud Run)                                  │
  │    request-id ──▶ rate-limit ──▶ zod .strict() validate ──▶ handler   │
  │                                                        │               │
  │                                                        ▼               │
  │                                          call @copa/core engine(s)     │
  │                                          (crowd / routing / egress /   │
  │                                           weather / entry / …)         │
  │                                                        │               │
  │                     ┌──────────────────────────────────┤               │
  │            DEMO_MODE│                                   │LIVE           │
  │        deterministic│                                   │Gemini rewrite │
  │       reply from the│                                   │grounded in    │
  │         same engines│                                   │VERIFIED_      │
  │                     │                                   │STADIUM_DATA   │
  │                     └──────────────────┬────────────────┘               │
  │                                        ▼                                │
  │            Result<T, AppError> ──▶ typed JSON envelope                 │
  └───────────────────────────────────────┬───────────────────────────────┘
                                           │  HTTPS (JSON)
                                           ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │  @copa/web renders the validated, grounded response                   │
  └───────────────────────────────────────────────────────────────────────┘
```

### 4.1 The assistant query path

The conversational assistant is the clearest illustration of the flow, because it is where
the deterministic engine and the language model meet. A `POST /api/assistant/query` is
processed as follows:

1. **Validate.** The request body is parsed against a `.strict()` zod schema; unknown keys
   are rejected and a custom safe error map returns field-name-only messages that never echo
   input values.
2. **Rate-limit.** The assistant sits behind a dedicated token bucket of 10 requests per
   minute per IP (the general API limit is 60/min).
3. **Route intent.** The engine's intent router selects the appropriate tool for the
   message.
4. **Execute the tool.** The selected tool calls `@copa/core` — one of the crowd, routing,
   egress, weather, entry, or sustainability engines — and produces verified structured
   data.
5. **Compose the reply.**
   - In **`DEMO_MODE`**, the reply is composed directly from the tool output, fully
     deterministically, and the response is labelled `engine: "demo"`.
   - In **LIVE** mode, Gemini (`gemini-3-flash`, reached through the `llm-service` proxy at
     `https://llm.lehana.in`) rewrites the reply, grounded in the tool output injected as
     `VERIFIED_STADIUM_DATA` and fenced by a per-request nonce. The response is labelled
     `engine: "gemini"`.
6. **Degrade gracefully.** Any upstream failure in the LIVE path automatically falls back
   to the deterministic demo composition, so the assistant never hard-fails on an LLM error.

The response is a typed envelope of the form
`{ reply: { text, language, engine, toolTraces } }`. Production runs with `DEMO_MODE=false`,
so `POST /api/assistant/query` returns `engine: "gemini"`. The grounding boundary, prompt
construction, and refusal behaviour are covered in detail in the
[AI Assistant & Grounding Design](./03-ai-assistant.md) document.

### 4.2 The operations-briefing path

`POST /api/ops/briefing` aggregates a time window of engine state — a simulated window plus
incidents, weather, and sustainability — into a summary for the operations room. Repeated
requests for the same `(venue, scenario, minute, window, role)` key are served from a
60-second TTL cache, so dashboard clicks do not re-aggregate or re-invoke the model. As with
the assistant, the demo path composes the briefing deterministically and the LIVE path uses
Gemini to tighten the prose, returning `{ headline, bullets, topActions, cached, engine }`.

### 4.3 zod contracts as the single source of truth

The shared schemas in `packages/core/src/schemas.ts` are the contract that binds the whole
system together. They are:

- **the API's validation layer** — every endpoint parses its input with a `.strict()`
  schema, rejecting unknown keys;
- **the web app's response validator** — the client wrapper parses API responses against the
  same schema objects; and
- **the type source** — the TypeScript types the apps program against are inferred from these
  schemas.

Because both apps import the schemas from `@copa/core`, there is exactly one definition of
each shape. The `safeErrorMap` configured in the schema module ensures validation failures
report which field was invalid without reflecting the offending value, which is both a
usability and a security property (see [Security](./06-security.md)).

---

## 5. The error model

Errors flow through a single, typed channel rather than as thrown exceptions caught
ad hoc. The core defines a `Result<T, AppError>` type in `result.ts` and an `AppError`
taxonomy in `errors.ts`.

### 5.1 `Result<T, AppError>`

Domain operations that can fail return a `Result` — a discriminated union of a success case
carrying a `T` and a failure case carrying an `AppError`. This makes failure part of a
function's type signature: a caller cannot ignore the possibility of an error without the
type checker noticing. The engine never throws for expected domain conditions (an unroutable
path, a rejected mission, a missing venue); it returns a typed failure the API layer knows
how to translate.

### 5.2 The `AppError` taxonomy and typed envelope

Every error the API returns to a client is one of a fixed set of codes, each mapped to an
HTTP status:

| Code | HTTP status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Request failed `.strict()` zod validation |
| `NOT_FOUND` | 404 | Requested resource (venue, user, incident) does not exist |
| `ROUTE_UNAVAILABLE` | 409 | No safe route satisfies the request constraints |
| `PAYLOAD_TOO_LARGE` | 413 | Request body exceeded the JSON size cap |
| `MISSION_REJECTED` | 422 | Mission completion failed a server-side rule (e.g. replay) |
| `RATE_LIMITED` | 429 | Per-IP token bucket exhausted |
| `INTERNAL` | 500 | Unhandled internal condition |
| `UPSTREAM_FAILURE` | 502 | LLM / upstream dependency failed (sanitized) |
| `ASSISTANT_UNAVAILABLE` | 503 | Assistant path could not serve the request |

The client-facing envelope is uniform: `{ error: { code, message } }`, where `code` is one
of the values above and `message` is a safe, localized string derived from the taxonomy in
`errors.ts` (localization is resolved through `i18n.ts` across the six supported languages).

Two properties of this model are load-bearing for security and are asserted by tests:

- **Upstream failures are sanitized.** An LLM or proxy error is collapsed to
  `UPSTREAM_FAILURE`; request bodies, authentication, and raw upstream payloads are never
  logged or surfaced to the client.
- **`AppError` carries a `diagnostics` field that is never serialized to clients.** Internal
  diagnostic context stays server-side; tests assert it does not appear in any client
  response.

These controls are part of the broader defence-in-depth model documented in
[Security](./06-security.md).

---

## 6. Persistence seam

State that must outlive a single request is reached only through an async, pagination-shaped
`UserStore` interface. The current implementation is an `InMemoryUserStore`; a Cloud
Firestore adapter is a drop-in that changes only the store service and requires zero route
changes. Modelling persistence as an interface keeps the engine and the handlers free of
storage concerns and makes the eventual managed-database swap a localized change. Firestore
is catalogued accordingly in the Google service catalogue (see
[Google Cloud & Gemini Integration](./08-google-cloud.md)).

---

## 7. Tech stack

Versions are taken from the workspace manifests (`package.json`,
`packages/core/package.json`, `apps/api/package.json`, `apps/web/package.json`) and the
project's authoritative facts. `^` denotes the semver range declared in the manifest.

### Languages and runtime

| Item | Version / setting |
|---|---|
| TypeScript | `^5.7` (strict, with `noUncheckedIndexedAccess`) |
| Node.js | `>=20` |
| Package management | npm workspaces monorepo |

### Core engine (`@copa/core`)

| Item | Version |
|---|---|
| `zod` (only runtime dependency) | `^3.24` |

### API (`@copa/api`)

| Item | Version |
|---|---|
| Express | `^4.21` |
| `zod` | `^3.24` |
| Gemini model (via `llm-service` proxy at `https://llm.lehana.in`, OpenAI-compatible) | `gemini-3-flash` |

### Web (`@copa/web`)

| Item | Version |
|---|---|
| Next.js (App Router) | `^15.3` |
| React / React DOM | `^19` |
| Framer Motion | `^12` |
| Tailwind CSS | `^4` |

### Testing and quality tooling

| Item | Version |
|---|---|
| Vitest | `^2.1.8` |
| Supertest (API integration) | `^7` |
| Playwright | `^1.49` |
| `@axe-core/playwright` | `^4.10` |
| Testing Library (React) | `^16.1` |
| ESLint (flat config) | `^9.17` |
| typescript-eslint | `^8.18` |
| Prettier | `^3.4` |

### Build, delivery, and cloud

| Item | Detail |
|---|---|
| Containers | Docker multi-stage, non-root, digest-pinned base images |
| Build & registry | Cloud Build + Artifact Registry |
| Hosting | Cloud Run (`us-central1`), scale-to-zero, `--max-instances=3` |
| Secrets | Secret Manager (LLM key mounted by reference, server-side only) |
| Observability | Cloud Logging (structured, PII-safe request logs) |
| CI | GitHub Actions, SHA-pinned actions |

For how these pieces are assembled into a build and pushed to Cloud Run — including the CI
pipeline stages, environments, and configuration — see
[Deployment & Operations](./09-deployment.md). The test layers summarized above are detailed
in [Testing Strategy](./05-testing.md), and the engineering standards that keep the codebase
consistent are in [Code Quality & Engineering Standards](./04-code-quality.md).

---

## 8. Why this architecture

The structure is chosen to make correctness cheap to verify and failure cheap to survive:

- **A pure core** isolates all domain reasoning behind a dependency boundary that cannot
  reach for a clock, a random source, or the network — so it is exhaustively testable and
  identical everywhere it runs.
- **A thin API** confines the messy realities of the outside world (environment, rate limits,
  logging, the LLM upstream) to one layer, constructed through a `buildApp(config)` factory
  that is testable in-process.
- **A schema-driven web client** consumes the same contracts the API enforces, so there is a
  single source of truth for every shape crossing the wire.
- **A typed error channel** turns failure into data — a `Result<T, AppError>` and a uniform
  envelope — instead of scattered exceptions, and guarantees that internal diagnostics and
  upstream payloads never leak to clients.

The through-line is reproducibility: because the engine is deterministic, every claim the
product makes on screen can be re-derived and asserted, and the demo, the tests, and the live
Gemini-backed deployment all rest on the same verifiable foundation.
