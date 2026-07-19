# Testing

Five layers, all runnable from a clean checkout with zero keys. The deterministic core (no `Date.now()`, no `Math.random()` — time and seed are parameters) is what makes every UI number assertable without mocking.

## Layers & counts

| Layer | Tool | Location | Count |
|---|---|---|---|
| Core unit | Vitest | `packages/core/src/*.test.ts` (one file per module + `boundaries.test.ts`) | **1,351** |
| API integration | Vitest + Supertest (against `buildApp`, no live port) | `apps/api/src/__tests__/` | **160** |
| Web component | Vitest + Testing Library (jsdom) | `apps/web/**/__tests__/` | **42** |
| E2E + a11y | Playwright + `@axe-core/playwright` | `e2e/` | **52** |
| **Total** | | | **1,605** |

## Coverage (gated in CI)
- **`@copa/core`: 99.4% statements** (thresholds enforced: lines/statements/functions ≥ 95, branches ≥ 90).
- **API 92% statements** (gate ≥ 80); web ≥ 55. Run `npm run test:coverage`.

## What each layer proves
- **Core unit** — parameterized `test.each` matrices over scenarios × phases × venues × profiles × languages: crowd correctness & determinism, routing constraints (wheelchair = step-free only; never through critical unless unavoidable), egress savings, the weather state machine (8-mile rule), incident triage ordering, entry-readiness (ghost-ticket), emission math, mission validation & point formulas, leaderboard ordering, locale resolution (regional-tag regression), schema strictness & no-raw-input-echo, and Google-catalog honesty invariants.
- **API integration** — the endpoint contract (200/400/404/413/429), a crowd response asserted **equal to a direct engine call** (no fixture drift), rate-bucket limit/refill/prune, security headers, CORS allow-list, secret-absence sweeps, log redaction, the assistant tool-execution loop across personas × languages, the 10-prompt injection red team, the briefing cache, and the defence-in-depth security layer: Unicode/bidi input sanitisation, the SSRF allow-list on the key-bearing upstream, request-correlation ids, and the fail-closed startup self-test.
- **Web component** — UI-kit a11y semantics (ARIA meter values, real buttons, alert/retry), session hydration + corrupt-guard, api-client response validation (no blind casts), theme persistence, string-catalog completeness.
- **E2E + a11y** — axe (WCAG 2.1 A/AA) on **all 10 routes in light AND dark** (including the in-app accessibility settings panel and WCAG catalogue), plus persona journeys (fan dashboard → exit advice; assistant wheelchair route; organizer briefing; RTL switch) on desktop and mobile, asserting engine-derived behaviour, not just visibility.

## Fixtures are derived, never hardcoded
Test expectations are computed from the engine (e.g. a Green-Footprint award equals `MISSIONS[...].basePoints + pointsForCo2(commuteFootprint(...).kgCo2eSavedVsRideshare)`), so a factor change can never leave a passing-but-wrong test.

## Honest gaps
- Live-Gemini responses are exercised via the injectable `fetchFn` seam, not a real key in CI (the key path is covered by the client tests; CI runs in demo mode).
- Manual screen-reader passes (NVDA/VoiceOver) are recommended but not automated.
- Windows: Playwright runs single-worker with a 30s hook timeout for dev-server stability.
