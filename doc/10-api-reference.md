# API Reference — Copa Copilot

This document is the canonical reference for the Copa Copilot REST API. It
describes the base URL and conventions, every endpoint that the running service
exposes, the request and response contracts, the shared error envelope and its
codes, and the rate and body-size limits enforced by the platform.

Every endpoint and every number in this reference is drawn directly from the
service source: the route files under `apps/api/src/routes/`, the shared request
schemas in `packages/core/src/schemas.ts`, the error taxonomy in
`packages/core/src/errors.ts`, the rate limiter in
`apps/api/src/middleware/rate-limit.ts`, and the application composition in
`apps/api/src/server.ts`. The published contract also exists as an
OpenAPI 3.1 document at [`openapi.yaml`](../openapi.yaml) in the repository root.

For the design rationale behind the API — the deterministic engine it wraps, the
request/response flow, and the error model — see
[System Architecture](./01-architecture.md). For the assistant endpoints
specifically, see [AI Assistant & Grounding Design](./03-ai-assistant.md). For
the threat model behind the validation, rate limits, and error envelope, see
[Security](./06-security.md).

---

## 1. Base URL and conventions

### 1.1 Base URLs

| Environment | Base URL |
|-------------|----------|
| Production (Cloud Run, `us-central1`) | `https://copa-copilot-api-767171449038.us-central1.run.app` |
| Local development | `http://localhost:8080` |

The production base URL above is the one declared in
[`openapi.yaml`](../openapi.yaml) and used in the README and CHANGELOG version
blockquotes (project-number form). Cloud Run also serves the same revision under
the hash-form hostname `https://copa-copilot-api-ktdjm6xcyq-uc.a.run.app`; both
resolve to the same service. All paths in this document are relative to the
chosen base URL and are prefixed with `/api`.

To confirm which build a base URL is serving, call `GET /api/meta` — it returns
the running service name, version, and uptime.

### 1.2 Content type

The API speaks JSON exclusively. Request bodies for `POST`/`PATCH` endpoints must
be `application/json`; responses are always `application/json`. The service does
not render HTML, and the API-origin security headers advertise this directly:
`content-security-policy: default-src 'none'; frame-ancestors 'none'`.

### 1.3 Validation and the strict contract

Every request body and query string is validated by a shared zod schema before
any handler runs. Validation is wired through two thin wrappers in
`apps/api/src/middleware/validate.ts`:

- `withBody(schema, handler)` — validates `req.body`, passes the parsed, typed
  body to the handler.
- `withQuery(schema, handler)` — validates the query string (numeric values are
  coerced from strings first), passes the parsed, typed query to the handler.

The schemas live in a single source, `packages/core/src/schemas.ts`, and are
imported by both the API and the web app so the two never drift. Every request
schema is declared with zod's `.strict()`, so **unknown keys are rejected** — a
body carrying a field the schema does not name fails validation rather than being
silently ignored. Enum fields reject any value outside their allowed set, and
free-text fields reject markup (`<` and `>` are disallowed on display strings).

When validation fails, the response never echoes the offending value. A custom
zod error map (`safeErrorMap`) produces field-name-only messages such as
`Field "venueId" is not one of the allowed values.` — the value that was
submitted is never reflected back.

### 1.4 Error envelope

Every failure — validation, not-found, rate-limit, payload-too-large, upstream,
or internal — is returned as the same JSON envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "We could not find what you asked for."
  }
}
```

The `code` is a stable machine-readable string; the `message` is a safe,
human-readable string. See [Section 4](#4-errors) for the full code list and the
localization behavior.

### 1.5 Response localization

Error messages returned through `sendError` are localized from the
`Accept-Language` request header across the six supported UI languages — English
(`en`), Spanish (`es`), French (`fr`), Arabic (`ar`), Hindi (`hi`), and
Portuguese (`pt`) — falling back to English when the header is absent or
unrecognized. The messages contain no interpolation, so no request data or
internal detail can leak through them.

### 1.6 CORS

CORS is governed by a server-side allow-list configured per environment
(`config.allowedOrigins` in `apps/api/src/server.ts`). Requests from a listed
origin receive:

- `Access-Control-Allow-Origin: <the request origin>`
- `Access-Control-Allow-Methods: GET,POST,PATCH,OPTIONS`
- `Access-Control-Allow-Headers: content-type,accept-language`
- `Vary: Origin`

Origins that are not on the allow-list receive **no CORS headers at all** — there
is no wildcard fallback. Preflight `OPTIONS` requests are answered with `204 No
Content`.

### 1.7 Security headers

Every API response carries a fixed set of hardening headers set in `server.ts`:

| Header | Value |
|--------|-------|
| `content-security-policy` | `default-src 'none'; frame-ancestors 'none'` |
| `x-content-type-options` | `nosniff` |
| `x-frame-options` | `DENY` |
| `referrer-policy` | `no-referrer` |
| `strict-transport-security` | `max-age=31536000; includeSubDomains` |
| `permissions-policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |

The `X-Powered-By` header is disabled. See [Security](./06-security.md) for the
full posture.

### 1.8 Request identity and proxy trust

The application sets `trust proxy` to exactly one hop (Cloud Run's front end), so
`req.ip` reflects the real client and a forged `X-Forwarded-For` chain cannot
change which rate bucket a caller lands in. A per-request correlation identifier
is attached by the request-id middleware for traceability.

### 1.9 Shared path and query parameters

Several endpoints share the same parameters, defined once in
`packages/core/src/schemas.ts`:

| Parameter | Location | Type / range | Default |
|-----------|----------|--------------|---------|
| `venueId` | path | one of the 16 registered venue ids (`VENUE_IDS`) | — (required) |
| `minute` | query/body | integer, `-240`..`240` (match-relative minute) | `30` |
| `scenario` | query/body | `normal`, `gate-bottleneck`, `egress-surge`, `weather-hold` | `normal` (`egress-surge` for egress) |

The `minute` value is a match-relative minute: gates open at `-240` at the
earliest and egress concludes by `+240`. The simulation is deterministic in the
`(venueId, scenario, minute, seed)` tuple, so any moment is fully reproducible —
see [Domain Model & Determinism](./11-domain-model.md).

---

## 2. Endpoint catalogue

The tables below list every endpoint the service registers, grouped by the router
that owns it. `Auth` is not shown because the API requires no client credentials;
access control is by CORS origin and rate limit. Request schemas reference the
exported zod schemas in `packages/core/src/schemas.ts`.

### 2.1 Meta and service evidence — `routes/meta.ts`

| Method | Path | Purpose | Request | Success shape |
|--------|------|---------|---------|---------------|
| `GET` | `/api/health` | Liveness probe | — | `200` `{ "status": "ok" }` |
| `GET` | `/api/meta` | Service metadata (version only) | — | `200` `{ service, version, uptimeSeconds }` |
| `GET` | `/api/google/services` | Evidence-as-code Google service catalogue | — | `200` `{ scorecard, services, runtime }` |

Notes:

- `GET /api/meta` intentionally exposes only the service name, the API version
  (currently `0.2.0`, from `apps/api/src/version.ts`), and integer uptime in
  seconds. It never serves demo/bypass or configuration flags.
- `GET /api/google/services` returns the catalogue from `@copa/core`
  (`buildScorecard()` plus `GOOGLE_SERVICES`) and a `runtime` object with
  **readiness signals only** — `geminiKeyPresent` (boolean) and `region`
  (`cloud-run` or `local`). It never returns key material or environment-variable
  values. See [Google Cloud & Gemini Integration](./08-google-cloud.md).

### 2.2 Venues, crowd, and transit — `routes/venues.ts`

| Method | Path | Purpose | Request | Success shape |
|--------|------|---------|---------|---------------|
| `GET` | `/api/venues` | List all 16 World Cup 2026 venues | — | `200` `{ venues: [...] }` |
| `GET` | `/api/venues/:venueId` | One venue plus its navigation graph | path `venueId` | `200` `{ venue, zones, edges }` |
| `GET` | `/api/crowd/:venueId` | Deterministic live crowd snapshot | path `venueId`, query `crowdQuerySchema` | `200` `{ snapshot }` |
| `GET` | `/api/transit/:venueId` | Transit-link loads for the venue | path `venueId`, query `crowdQuerySchema` | `200` `{ venueId, minute, transit }` |

- `GET /api/venues` returns a compact list; each entry is
  `{ id, name, city, country, capacity, climateControlled, flagship }`.
- `GET /api/venues/:venueId` returns the full venue record plus the venue's
  navigation graph (`zones` and `edges`), or `404 NOT_FOUND` for an unknown id.
- `GET /api/crowd/:venueId` and `GET /api/transit/:venueId` share
  `crowdQuerySchema` (`scenario` default `normal`, `minute` default `30`). Both
  return `404 NOT_FOUND` when the venue id is unknown. The crowd snapshot's zones
  follow the `ZoneCrowd` shape (`zoneId`, `name`, `kind`, `densityPct`,
  `status` ∈ `comfortable`/`busy`/`critical`, `queueMinutes`).

### 2.3 Guidance — routing, egress, weather, entry — `routes/guidance.ts`

| Method | Path | Purpose | Request | Success shape |
|--------|------|---------|---------|---------------|
| `POST` | `/api/routing/recommend` | Crowd- and accessibility-aware safest route | body `routingRequestSchema` | `200` `{ route }` |
| `POST` | `/api/egress/advice` | Exit-wave departure advice | body `egressRequestSchema` | `200` `{ advice }` |
| `GET` | `/api/egress/stagger/:venueId` | Organizer staggered-egress plan | path `venueId` | `200` `{ slots }` |
| `GET` | `/api/weather/:venueId` | Weather-protocol state + per-persona actions | path `venueId`, query `weatherQuerySchema` | `200` `{ protocol }` |
| `POST` | `/api/entry/assess` | Entry-readiness / ghost-ticket assessment | body `entryFactsSchema` | `200` `{ readiness }` |

- `POST /api/routing/recommend` calls the routing engine and returns the route on
  success. When the engine cannot find a safe route it returns the engine's error
  — `409 ROUTE_UNAVAILABLE`. An unknown venue returns `404 NOT_FOUND`.
- `POST /api/egress/advice` and `GET /api/egress/stagger/:venueId` wrap the
  egress advisor (the anti-MetLife exit-wave logic). Both surface engine errors
  through the standard envelope; unknown venues return `404 NOT_FOUND`.
- `GET /api/weather/:venueId` evaluates the weather-protocol state machine for the
  requested `preset` and `minute`; unknown venue returns `404 NOT_FOUND`.
- `POST /api/entry/assess` returns the entry-readiness assessment; all four
  boolean fact flags are required (no defaults).

### 2.4 Incidents — `routes/incidents.ts`

| Method | Path | Purpose | Request | Success shape |
|--------|------|---------|---------|---------------|
| `POST` | `/api/incidents` | Report an incident | body `incidentReportSchema` | `201` `{ incident }` |
| `GET` | `/api/incidents/:venueId` | Triage-ordered incident queue | path `venueId` | `200` `{ incidents }` |
| `PATCH` | `/api/incidents/:incidentId/advance` | Advance an incident along its lifecycle | path `incidentId` | `200` `{ incident }` |

- `POST /api/incidents` creates the incident with a server-assigned id
  (`<venueId>-rpt-<counter>`) and status `reported`, returning `201 Created`.
- `GET /api/incidents/:venueId` returns the queue **ordered by the triage
  engine** against a current crowd snapshot; an unknown venue returns
  `404 NOT_FOUND`. Incident storage is per-instance and in-memory (demo scale),
  seeded on first access so the queue is never empty.
- `PATCH /api/incidents/:incidentId/advance` moves an incident to its next
  lifecycle state. An unknown incident id returns `404 NOT_FOUND`; advancing an
  incident that is already at a terminal state returns the engine's error through
  the standard envelope.

> Note: incident advancement uses the `PATCH` verb (as registered in the route
> file and declared in `openapi.yaml`), not `POST`.

### 2.5 Assistant and operations briefing — `routes/assistant.ts`

| Method | Path | Purpose | Request | Success shape |
|--------|------|---------|---------|---------------|
| `POST` | `/api/assistant/query` | Grounded GenAI assistant reply | body `assistantQuerySchema` | `200` `{ reply }` |
| `POST` | `/api/ops/briefing` | AI operations briefing | body `briefingRequestSchema` | `200` `{ briefing }` |

Both endpoints sit behind the **stricter assistant rate tier** (10 requests per
minute per IP — see [Section 3](#3-rate-limits-and-body-size)) because they can
drive Gemini spend. Both degrade to deterministic engine output on any upstream
failure rather than surfacing an error, so a call returns a usable answer even
when the model is unavailable. In production (`DEMO_MODE=false`) a successful
assistant reply is labelled `engine: "gemini"`; in demo mode the same engines
produce a deterministic reply. See
[AI Assistant & Grounding Design](./03-ai-assistant.md).

- `POST /api/assistant/query` returns the assistant reply, including tool traces
  and the honest engine label.
- `POST /api/ops/briefing` returns the operations briefing (served through a
  short TTL cache per window). An unknown venue returns `404` with the envelope
  `{ "error": { "code": "NOT_FOUND", "message": "Unknown venue." } }`.

### 2.6 Engagement — profiles, missions, leaderboard — `routes/engagement.ts`

| Method | Path | Purpose | Request | Success shape |
|--------|------|---------|---------|---------------|
| `POST` | `/api/users/bootstrap` | Create an anonymous (no-PII) profile | body `bootstrapSchema` | `201` `{ profile }` |
| `GET` | `/api/users/:userId` | Fetch a profile | path `userId` | `200` `{ profile }` |
| `GET` | `/api/missions` | Mission catalogue | — | `200` `{ missions }` |
| `POST` | `/api/missions/complete` | Validate a completion and award points | body `missionClaimSchema` | `200` `{ award, profile }` |
| `GET` | `/api/leaderboard` | Section / venue / tournament leaderboard | query `leaderboardQuerySchema` | `200` `{ page, greenestSections }` |

- `POST /api/users/bootstrap` creates an anonymous profile with no PII. A
  client-claimed restore total (`claimedPoints`) is accepted but **clamped
  server-side** by the gamification engine — clients cannot mint points by
  inflating the field. Returns `201 Created`.
- `GET /api/users/:userId` returns the profile view or `404 NOT_FOUND`.
- `POST /api/missions/complete` validates the claim against the mission's
  conditions in the engine and awards the **engine-computed** point total; the
  server derives the honest arrival window rather than trusting the client. A
  replayed completion (the mission is already in the profile's completed list)
  returns `422 MISSION_REJECTED`; an unknown user returns `404 NOT_FOUND`; a
  claim that fails the engine's conditions returns the engine's error.
- `GET /api/leaderboard` returns a ranked page and, when a `venueId` is supplied,
  the greenest sections for that venue.

---

## 3. Request schemas

The following tables document the field-level contract for each request schema in
`packages/core/src/schemas.ts`. All schemas are `.strict()` — any field not
listed causes a `VALIDATION_FAILED` response. String fields marked "no markup"
reject any `<` or `>` character.

### 3.1 `crowdQuerySchema` — crowd & transit query

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `scenario` | enum | `normal`, `gate-bottleneck`, `egress-surge`, `weather-hold` | `normal` |
| `minute` | integer | `-240`..`240` | `30` |

### 3.2 `routingRequestSchema` — POST `/api/routing/recommend`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `venueId` | enum | one of `VENUE_IDS` | — (required) |
| `fromZoneId` | string | trimmed, 1–50 chars, no markup | — (required) |
| `toZoneId` | string | trimmed, 1–50 chars, no markup | — (required) |
| `profile` | enum | `none`, `wheelchair`, `low-vision`, `sensory-sensitive` | `none` |
| `scenario` | enum | as §3.1 | `normal` |
| `minute` | integer | `-240`..`240` | `30` |

### 3.3 `egressRequestSchema` — POST `/api/egress/advice`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `venueId` | enum | one of `VENUE_IDS` | — (required) |
| `mode` | enum | `rail`, `bus`, `rideshare`, `walk` | — (required) |
| `scenario` | enum | as §3.1 | `egress-surge` |

### 3.4 `weatherQuerySchema` — GET `/api/weather/:venueId`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `preset` | enum | `clear-day`, `philadelphia-lightning`, `heat-dome`, `passing-storm` | `clear-day` |
| `minute` | integer | `-240`..`240` | `30` |

### 3.5 `entryFactsSchema` — POST `/api/entry/assess`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `venueId` | enum | one of `VENUE_IDS` | — (required) |
| `ticketSource` | enum | `official`, `official-resale`, `third-party` | — (required) |
| `transferConfirmed` | boolean | — | — (required) |
| `idPacked` | boolean | — | — (required) |
| `bagCompliant` | boolean | — | — (required) |

### 3.6 `incidentReportSchema` — POST `/api/incidents`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `venueId` | enum | one of `VENUE_IDS` | — (required) |
| `zoneId` | string | trimmed, 1–50 chars, no markup | — (required) |
| `category` | enum | one of `INCIDENT_CATEGORIES` | — (required) |
| `severity` | enum | one of `INCIDENT_SEVERITIES` | — (required) |
| `summary` | string | trimmed, 1–240 chars, no markup | — (required) |
| `minute` | integer | `-240`..`240` | `30` |

### 3.7 `assistantQuerySchema` — POST `/api/assistant/query`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `message` | string | trimmed, 1–1000 chars | — (required) |
| `venueId` | enum | one of `VENUE_IDS` | — (required) |
| `persona` | enum | `fan`, `volunteer`, `organizer`, `staff` | `fan` |
| `language` | string | trimmed, ≤20 chars | optional |
| `literacyTier` | enum | `standard`, `easy`, `audioFirst` | `standard` |
| `scenario` | enum | as §3.1 | `normal` |
| `minute` | integer | `-240`..`240` | `30` |

The 1,000-character `message` cap (`ASSISTANT_INPUT_MAX_CHARS`) is both an input
bound and a spend control on the model.

### 3.8 `briefingRequestSchema` — POST `/api/ops/briefing`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `venueId` | enum | one of `VENUE_IDS` | — (required) |
| `windowMinutes` | integer | `5`..`60` | `15` |
| `role` | enum | `organizer`, `volunteer` | `organizer` |
| `scenario` | enum | as §3.1 | `normal` |
| `minute` | integer | `-240`..`240` | `30` |

### 3.9 `bootstrapSchema` — POST `/api/users/bootstrap`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `displayName` | string | trimmed, 1–30 chars, no markup | — (required) |
| `venueId` | enum | one of `VENUE_IDS` | — (required) |
| `sectionZoneId` | string | trimmed, 1–50 chars, no markup | — (required) |
| `claimedPoints` | integer | `0`..`1000000` (clamped server-side) | `0` |

### 3.10 `missionClaimSchema` — POST `/api/missions/complete`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `userId` | string | trimmed, 1–60 chars, no markup | — (required) |
| `missionId` | enum | one of `MISSION_IDS` | — (required) |
| `minute` | integer | `-240`..`240` | — (required) |
| `commuteMode` | enum | one of `COMMUTE_MODES` | optional |
| `commuteDistanceKm` | number | `0`..`500` | optional |
| `advisedLeaveMinute` | integer | `-240`..`240` | optional |
| `heatProtocolActive` | boolean | — | optional |

### 3.11 `leaderboardQuerySchema` — GET `/api/leaderboard`

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `scope` | enum | `section`, `venue`, `tournament` | `venue` |
| `venueId` | enum | one of `VENUE_IDS` | optional |
| `sectionZoneId` | string | trimmed, ≤50 chars, no markup | optional |
| `userId` | string | trimmed, ≤60 chars, no markup | optional |

---

## 4. Errors

### 4.1 The envelope

Every failure returns the same JSON shape and nothing else:

```json
{ "error": { "code": "<ERROR_CODE>", "message": "<safe message>" } }
```

There is one exception in message construction, and it is deliberate: for
schema-validation failures raised by `withBody`/`withQuery`, the `message` is the
concatenation of the safe, field-name-only issue messages from the zod error map
(for example, `Field "venueId" is not one of the allowed values.`). For every
other error code, the `message` is the localized safe message from
`packages/core/src/errors.ts`, chosen from the `Accept-Language` header. In no
case is the submitted value echoed back.

### 4.2 Error codes

The full taxonomy is defined once in `packages/core/src/errors.ts`; each code
maps to exactly one HTTP status.

| Code | HTTP | Meaning | Typical trigger |
|------|------|---------|-----------------|
| `VALIDATION_FAILED` | `400` | Request failed schema validation | Missing/typed-wrong field, disallowed enum value, unknown key (`.strict()`), markup in a display field, malformed JSON body |
| `NOT_FOUND` | `404` | Unknown resource | Unknown `venueId`, `userId`, or `incidentId`; any unmatched route |
| `ROUTE_UNAVAILABLE` | `409` | No safe route exists | Routing engine cannot produce a safe path for the request |
| `PAYLOAD_TOO_LARGE` | `413` | Body exceeds the size cap | JSON body larger than 32 kb |
| `MISSION_REJECTED` | `422` | Mission completion invalid | Replayed mission, or claim fails the engine's conditions |
| `RATE_LIMITED` | `429` | Too many requests | Per-IP token bucket exhausted (general or assistant tier) |
| `INTERNAL` | `500` | Unexpected server error | Uncaught throw inside a handler (diagnostics stay server-side) |
| `UPSTREAM_FAILURE` | `502` | A connected service failed | Upstream (model) failure surfaced as a sanitized code |
| `ASSISTANT_UNAVAILABLE` | `503` | Assistant temporarily unavailable | Assistant path cannot serve a reply |

The five codes most relevant to ordinary API consumers are
`VALIDATION_FAILED` (400), `NOT_FOUND` (404), `PAYLOAD_TOO_LARGE` (413),
`RATE_LIMITED` (429), and `UPSTREAM_FAILURE` (502). The remaining codes
(`ROUTE_UNAVAILABLE`, `MISSION_REJECTED`, `ASSISTANT_UNAVAILABLE`, `INTERNAL`)
are engine- or state-specific and are documented here for completeness.

### 4.3 Guarantees around error content

- **No raw-input echo.** Validation messages name the failing field only; they
  never include the submitted value (`safeErrorMap`).
- **No secret or upstream leakage.** Model/upstream failures are collapsed to
  `UPSTREAM_FAILURE`; upstream payloads and internals never enter a client
  message.
- **No server diagnostics on the wire.** `AppError` carries an optional
  `diagnostics` field for operators; the API layer never serializes it to
  clients (asserted by tests).

Assistant and briefing endpoints generally do not surface `UPSTREAM_FAILURE` to
the caller at all: on an upstream failure they fall back to deterministic engine
output and still return `200`. See [Security](./06-security.md) and
[AI Assistant & Grounding Design](./03-ai-assistant.md).

---

## 5. Rate limits and body size

### 5.1 Rate tiers

Rate limiting is enforced by per-IP token buckets defined in
`apps/api/src/middleware/rate-limit.ts`. There are two tiers:

| Tier | Limit | Applies to |
|------|-------|------------|
| General | **60 requests / minute / IP** | Every endpoint (applied globally in `server.ts`) |
| Assistant | **10 requests / minute / IP** | `POST /api/assistant/query` and `POST /api/ops/briefing` (in addition to the general tier) |

Buckets refill continuously (a fractional token per elapsed millisecond, capped
at the tier capacity), so a caller regains capacity smoothly rather than at fixed
window boundaries. Bucket keys are the real client IP — `trust proxy` is pinned
to one hop so a spoofed `X-Forwarded-For` cannot escape a bucket. Idle buckets
(no activity for over 10 minutes) are pruned opportunistically to bound memory.

Because buckets are per-process and Cloud Run runs with `--max-instances=3` and
scale-to-zero, the effective limit is per instance; a caller's requests are
counted against whichever instance serves them.

### 5.2 Rate-limit response

When a bucket is exhausted the request is answered with:

- HTTP `429`
- `Retry-After: 30`
- The standard envelope: `{ "error": { "code": "RATE_LIMITED", "message": "..." } }`

### 5.3 Body size cap

JSON request bodies are capped at **32 kb** (`BODY_LIMIT = '32kb'` in
`server.ts`). A body over the cap is rejected before any handler runs and
answered with HTTP `413` and code `PAYLOAD_TOO_LARGE`. Malformed JSON is answered
with HTTP `400` and code `VALIDATION_FAILED`.

---

## 6. Worked examples

### 6.1 Fetch the venue list

```bash
curl -s https://copa-copilot-api-767171449038.us-central1.run.app/api/venues
```

```json
{
  "venues": [
    { "id": "metlife", "name": "...", "city": "...", "country": "...",
      "capacity": 82500, "climateControlled": false, "flagship": true }
  ]
}
```

### 6.2 Crowd snapshot at a specific moment

```bash
curl -s "https://copa-copilot-api-767171449038.us-central1.run.app/api/crowd/metlife?scenario=egress-surge&minute=105"
```

The `(venueId, scenario, minute)` tuple plus the server seed fully determines the
response; the same request always returns the same snapshot.

### 6.3 Request a safest route

```bash
curl -s -X POST \
  -H 'content-type: application/json' \
  -d '{"venueId":"metlife","fromZoneId":"gate-a","toZoneId":"sec-114","profile":"wheelchair"}' \
  https://copa-copilot-api-767171449038.us-central1.run.app/api/routing/recommend
```

Omitted fields take their schema defaults (`scenario` = `normal`, `minute` =
`30`). If no safe route exists the response is `409 ROUTE_UNAVAILABLE`.

### 6.4 A validation failure (unknown key, strict schema)

```bash
curl -s -X POST \
  -H 'content-type: application/json' \
  -d '{"venueId":"metlife","mode":"rail","surprise":true}' \
  https://copa-copilot-api-767171449038.us-central1.run.app/api/egress/advice
```

```json
{ "error": { "code": "VALIDATION_FAILED",
             "message": "The request contains fields that are not allowed." } }
```

### 6.5 Ask the assistant

```bash
curl -s -X POST \
  -H 'content-type: application/json' \
  -H 'accept-language: es' \
  -d '{"message":"¿Cuándo debo salir del estadio?","venueId":"metlife","persona":"fan"}' \
  https://copa-copilot-api-767171449038.us-central1.run.app/api/assistant/query
```

Subject to the 10/min assistant tier. In production the reply is labelled
`engine: "gemini"`; on upstream failure the endpoint falls back to deterministic
engine output and still returns `200`.

---

## 7. Related documentation

- [System Architecture](./01-architecture.md) — the request/response flow and the
  error model that this API sits on top of.
- [AI Assistant & Grounding Design](./03-ai-assistant.md) — how
  `/api/assistant/query` and `/api/ops/briefing` are grounded and how they fall
  back.
- [Security](./06-security.md) — the threat model behind strict validation, the
  safe error envelope, rate limits, CORS, and header hardening.
- [Domain Model & Determinism](./11-domain-model.md) — venues, zones, scenarios,
  and how the `(venueId, scenario, minute, seed)` tuple yields reproducible
  results.
- [`openapi.yaml`](../openapi.yaml) — the machine-readable OpenAPI 3.1 contract.
