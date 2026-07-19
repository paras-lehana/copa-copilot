# Testing Strategy — Copa Copilot

Copa Copilot is verified by four test layers that run end-to-end from a clean
checkout with **zero API keys**. Every layer is executable with a single npm
command, every layer runs in continuous integration, and coverage on the domain
core and the API is enforced by hard thresholds that fail the build when they
regress.

The central design decision that makes this possible is determinism. The domain
engine, [`@copa/core`](./01-architecture.md), contains no `Date.now()` and no
`Math.random()` — the match minute (time) and the simulation seed are always
parameters. Because the same inputs always produce the same outputs, every number
the UI displays is reproducible in a plain unit test, with no mocking, no
snapshot fuzzing, and no network stubbing. See
[Domain Model & Determinism](./11-domain-model.md) for how the seeded PRNG and
parameterized time work.

---

## 1. The four layers at a glance

The layers, their tooling, their location in the repository, and their exact
counts are recorded in [`TESTING.md`](../TESTING.md):

| Layer | Tool | Location | Count |
|---|---|---|---|
| Core unit | Vitest | `packages/core/src/*.test.ts` (one file per module + `boundaries.test.ts`) | **1,351** |
| API integration | Vitest + Supertest (against `buildApp`, no live port) | `apps/api/src/__tests__/` | **160** |
| Web component | Vitest + Testing Library (jsdom) | `apps/web/**/__tests__/` | **42** |
| E2E + a11y | Playwright + `@axe-core/playwright` | `e2e/` | **52** |
| **Total** | | | **1,605** |

The distribution is deliberately bottom-heavy. The overwhelming majority of
assertions live in the pure domain core, where they are fast, deterministic, and
free of infrastructure. The API, web, and end-to-end layers each verify a
progressively larger integration boundary, but none of them re-prove the domain
logic — they prove that the boundary faithfully surfaces what the core already
guarantees.

### Tooling

The test stack, drawn from the project's technology choices, is:

- **Vitest ^2.1.8** for all unit and component tests, including coverage.
- **Supertest** for API integration, exercising the Express app object
  (`buildApp`) in-process — no live TCP port is opened.
- **Testing Library** on **jsdom** for React component tests.
- **Playwright ^1.49** with **`@axe-core/playwright` ^4.10** for end-to-end and
  accessibility scanning.

---

## 2. Determinism: why UI numbers are assertable without mocking

Most UI test suites cannot assert on displayed numbers, because those numbers
come from clocks, random draws, or live services that differ run to run. Copa
Copilot removes all three sources of nondeterminism from the domain core:

- **No wall-clock time.** The match minute is passed in as a parameter, so an
  egress advisory or a crowd curve at minute 85 is identical on every machine
  and every run.
- **No `Math.random()`.** All stochastic behaviour flows through the seeded PRNG
  in `packages/core/src/prng.ts`. A given `SIM_SEED` reproduces the same crowd,
  queue, and transit simulation exactly.
- **No hidden dependencies.** [`@copa/core`](./01-architecture.md) is a pure
  domain package with zero runtime dependencies beyond zod, so there is nothing
  external to stub.

The practical consequence: a test can call a core function directly, compute the
expected value from the same engine, and assert byte-for-byte equality against
what the API returns and what the UI renders. There is no mock layer between the
assertion and the behaviour, which means the tests exercise the real code path a
user hits — including in the demo mode that CI runs in.

The Playwright configuration reinforces this at the browser layer. In
[`playwright.config.ts`](../playwright.config.ts) the API dev server is launched
with `DEMO_MODE=true` and a fixed `SIM_SEED=26`, so the end-to-end suite drives a
fully deterministic backend:

```ts
command: `cross-env DEMO_MODE=true PORT=${API_PORT} SIM_SEED=26 ALLOWED_ORIGINS=http://localhost:${WEB_PORT} npm run dev -w @copa/api`,
```

The config also emulates `prefers-reduced-motion: reduce`, so entrance
animations settle instantly. That serves two purposes at once: axe scans the
final, stable layout rather than a mid-animation frame, and it mirrors the
experience of a real reduced-motion user.

---

## 3. Coverage gates

Coverage is not merely reported; it is enforced, and a regression below the
threshold fails CI. The gates are:

| Package | Metric | Measured | Enforced threshold |
|---|---|---|---|
| `@copa/core` | Statements | **99.4%** | lines / statements / functions ≥ 95, branches ≥ 90 |
| API (`apps/api`) | Statements | **92%** | ≥ 80 |
| Web (`apps/web`) | Statements | — | ≥ 55 |

The domain core carries the strictest bar because it is where correctness lives:
crowd math, routing constraints, the weather protocol, emission calculations,
and mission point formulas all resolve there. The 99.4% statement figure sits
comfortably above the enforced floor, and the branch threshold of 90% ensures
that conditional logic — not just happy-path lines — is exercised.

Coverage for all packages is produced by:

```bash
npm run test:coverage
```

---

## 4. What each layer proves

Counts and coverage describe scale; this section describes intent. Each layer
proves a distinct property, and together they form a chain from pure logic to a
rendered, accessible page.

### 4.1 Core unit — parameterized correctness matrices (1,351)

The core suite lives beside the modules it tests, one `*.test.ts` file per module
in `packages/core/src/`, plus a dedicated `boundaries.test.ts` for edge
conditions. Its defining technique is the parameterized `test.each` matrix,
sweeping across **scenarios × phases × venues × profiles × languages** so that
correctness and determinism are proven over the full input space rather than a
handful of chosen examples.

Concretely, the core layer proves:

- **Crowd correctness and determinism** — `crowd.ts` produces the same seeded
  crowd, queue, and transit state for identical inputs.
- **Routing constraints** — `routing.ts` respects accessibility rules: a
  wheelchair profile is routed step-free only, and a route never passes through a
  critical (unsafe) zone unless there is no alternative.
- **Egress savings** — `egress.ts`, the anti-MetLife exit-wave advisor, yields
  the expected staggered-departure benefit.
- **The weather state machine** — `weather.ts` correctly transitions under the
  8-mile lightning rule and the heat-tier protocol.
- **Incident triage ordering** — `incidents.ts` orders and advances incidents as
  specified.
- **Entry readiness** — `entry.ts` anti-ghost-ticket assessment.
- **Emission math** — `sustainability.ts` CO2e calculations.
- **Mission validation and point formulas** — `gamification.ts`, including the
  server-side `clampRestoredPoints` guard.
- **Leaderboard ordering** — `leaderboard.ts`.
- **Locale resolution** — `i18n.ts` across the six supported languages, with
  regression coverage on regional BCP-47 tags.
- **Schema strictness and no-raw-input-echo** — `schemas.ts` rejects unknown
  keys and its `safeErrorMap` never echoes submitted values.
- **Evidence-as-code invariants** — the honesty checks over the Google service
  catalogue (`google/service-catalog.ts`) and the WCAG catalogue
  (`a11y/wcag-catalog.ts`).

### 4.2 API integration — the endpoint contract (160)

The API suite in `apps/api/src/__tests__/` runs against the Express application
object built by `buildApp` using Supertest, so no live port is bound. It proves
the HTTP contract across all [22 endpoints](./10-api-reference.md) and the
defence-in-depth layer described in [Security](./06-security.md):

- **Status-code contract** — correct `200 / 400 / 404 / 413 / 429` responses,
  mapped from the [`AppError` taxonomy](./01-architecture.md).
- **No fixture drift** — a crowd response is asserted **equal to a direct
  `@copa/core` engine call**, so the API can never silently diverge from the
  domain truth.
- **Rate limiting** — the per-IP token buckets (60/min general, 10/min
  assistant) are tested for limit, refill, and prune behaviour.
- **Security headers and CORS** — hardening headers and the CORS allow-list are
  asserted.
- **Secret hygiene** — secret-absence sweeps confirm no key material leaks into
  responses, and log-redaction tests confirm bodies and auth are never logged.
- **The assistant loop** — the tool-execution loop is exercised across
  personas × languages, alongside the **10-prompt injection red team** described
  in [AI Assistant & Grounding Design](./03-ai-assistant.md).
- **The briefing cache** — the 60-second TTL cache on `/api/ops/briefing`.
- **Additional defence-in-depth** — Unicode/bidi input sanitisation, the SSRF
  allow-list on the key-bearing upstream, request-correlation ids, and the
  fail-closed startup self-test.

### 4.3 Web component — accessible UI semantics (42)

The web component suite (`apps/web/**/__tests__/`) uses Testing Library on jsdom
to verify that the UI kit renders correct, accessible semantics and that the
client handles data defensively:

- **UI-kit a11y semantics** — ARIA meter values are correct, controls are real
  `<button>` elements, and alert/retry affordances expose the right roles.
- **Session hydration and corrupt-guard** — persisted session state hydrates
  correctly and malformed stored state is guarded against.
- **API-client validation** — responses are validated rather than blindly cast,
  so a malformed payload cannot flow unchecked into the UI.
- **Theme persistence** — the light/dark theme choice survives reloads.
- **String-catalog completeness** — the localization catalogue has no missing
  keys.

### 4.4 E2E + a11y — axe in both themes and persona journeys (52)

The Playwright suite in `e2e/` is the top of the chain, driving the real web app
against the deterministic demo API. It runs across two device projects defined in
[`playwright.config.ts`](../playwright.config.ts) — `desktop` (Desktop Chrome)
and `mobile` (Pixel 7) — and proves two things:

- **Accessibility conformance** — `@axe-core/playwright` scans against WCAG 2.1
  A/AA on **all 10 routes, in light AND dark theme** (20 scans total), including
  the in-app accessibility settings panel and the WCAG conformance catalogue
  page. See [Accessibility](./07-accessibility.md).
- **Persona journeys** — realistic end-to-end flows for each persona: fan
  dashboard through to exit advice; an assistant wheelchair-route request; the
  organizer briefing; and the RTL (Arabic) language switch. Crucially, these
  journeys assert **engine-derived behaviour, not just element visibility** — the
  values on screen are checked against what the deterministic engine produces.

The suite is single-worker and non-parallel by configuration
(`workers: 1`, `fullyParallel: false`), with the API and web dev servers brought
up by Playwright's `webServer` blocks so `npm run e2e` is a single command from a
clean checkout.

---

## 5. Fixtures are derived, never hardcoded

A recurring failure mode in test suites is the "passing-but-wrong" test: a
constant is changed in production code, but the expected value in the test was
copied by hand and no longer reflects the intended behaviour, so the test keeps
passing while the product is wrong.

Copa Copilot avoids this by computing expected values **from the engine itself**
rather than pasting literals. For example, a Green-Footprint mission award is
asserted against a value computed live from the domain functions:

```
MISSIONS[...].basePoints + pointsForCo2(commuteFootprint(...).kgCo2eSavedVsRideshare)
```

Because the expectation is derived from the same source of truth that the
production code uses, a change to an underlying factor propagates into both the
code and the test simultaneously. A factor change can never leave behind a
passing-but-wrong test — either the behaviour is correct in both places or the
test fails.

---

## 6. Running the suites

Every layer is runnable from a clean checkout with no API keys. The core,
API, and web layers run in demo mode by construction; the end-to-end layer
launches its own demo-mode servers.

```bash
# All unit / integration / component tests
npm test

# With enforced coverage thresholds
npm run test:coverage

# End-to-end + accessibility (Playwright brings up API + web itself)
npm run e2e
```

All four layers are gated in CI via [GitHub Actions](./09-deployment.md), so a
merge that breaks a contract, drops coverage below threshold, or introduces a
WCAG A/AA violation on any scanned route is blocked before it lands.

---

## 7. Honest gaps

The suite is thorough, but the following limitations are documented rather than
hidden:

- **Live-Gemini responses** are exercised through the injectable `fetchFn` seam,
  not a real API key in CI. The key-bearing client path is covered by the client
  tests, and CI otherwise runs in demo mode. See
  [AI Assistant & Grounding Design](./03-ai-assistant.md) for the DEMO/LIVE
  split.
- **Manual screen-reader passes** (NVDA, VoiceOver) are recommended but not
  automated; axe covers programmatic conformance, not the lived assistive-tech
  experience.
- **Windows CI stability** — Playwright runs single-worker with an extended hook
  timeout for Next.js dev-server stability on Windows, a deliberate trade of
  parallelism for reliability.

---

## Related documentation

- [System Architecture](./01-architecture.md) — the monorepo, the three
  packages, and the error model the API tests assert against.
- [Domain Model & Determinism](./11-domain-model.md) — the seed and time
  parameters that make every number reproducible.
- [Security](./06-security.md) — the STRIDE-lite controls the API integration
  layer verifies.
- [Accessibility](./07-accessibility.md) — the WCAG 2.1 AA conformance model (catalogued against WCAG 2.2 criteria) behind
  the axe scans.
- [API Reference](./10-api-reference.md) — the endpoint contracts under test.
- [Deployment & Operations](./09-deployment.md) — how the layers are gated in CI.
