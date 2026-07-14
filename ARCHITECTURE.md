# Architecture

## Layers (strict one-directional dependency)

```
apps/web (Next.js/React, Cloud Run)  ─┐
                                       ├─▶  @copa/core   (zod only; no I/O, no clock, no RNG)
apps/api (Express, Cloud Run)        ─┘
```

`@copa/core` depends on nothing but `zod`. `apps/web` and `apps/api` depend on `core`. Core never imports an app. This keeps the domain logic pure, portable and 99.4%-testable.

## The deterministic core — why it matters
No `Date.now()`, no `Math.random()` anywhere in `core`: time (match minute) and a seed are function parameters. The same `(venue, scenario, minute, seed)` always yields the same snapshot, so:
- every number the UI shows is reproducible in a unit test,
- the demo is identical on every machine and every deploy,
- e2e tests assert real values instead of "an element is visible."

## Data flow — assistant query
```
POST /api/assistant/query
  → zod validate (strict, safe errors)
  → assistant tier rate-limit (10/min/IP)
  → routeIntent(message) picks a tool
  → executeTool() calls @copa/core (crowd/routing/egress/weather/entry/sustainability)
  → DEMO_MODE: compose reply from tool output (deterministic)
    LIVE: Gemini rewrites, grounded in VERIFIED_STADIUM_DATA + nonce-fenced input
    (any Gemini failure → automatic demo fallback)
  → { reply: { text, language, engine, toolTraces } }
```

## Data flow — operations briefing
```
POST /api/ops/briefing
  → aggregate a window via simulateWindow() + incidents + weather + sustainability
  → per-(venue,scenario,minute,window,role) TTL cache (60s)
  → DEMO compose / LIVE Gemini tighten → { headline, bullets, topActions, cached, engine }
```

## Persistence seam
`UserStore` is an async, pagination-shaped interface. Today an `InMemoryUserStore`; a Firestore adapter is a drop-in that changes only `services/store.ts` — zero route changes. Documented so the swap is obvious.

## Efficiency decisions (each annotated `// Efficiency:` in code)
| Decision | Rationale |
|---|---|
| Zero-runtime-dep core | tiny install, fast cold start, nothing to audit at runtime |
| Closed-form crowd/queue curves | indistinguishable from a queue simulation at demo scale, fully deterministic |
| Linear-scan Dijkstra | graphs are < 40 nodes; a heap would be ceremony (route solve < 5ms, benchmarked) |
| Briefing TTL cache | repeated dashboard clicks don't re-aggregate or re-call Gemini |
| Reply budget (≤180 words) + 1,000-char input cap | bounds Gemini spend |
| Deterministic fallbacks instead of retries | no retry storms; graceful degradation is instant |
| Cloud Run `--max-instances=3`, scale-to-zero | spend-bounded; $0 at idle |

## Delivery
Docker (multi-stage, non-root, digest-pinned) → Cloud Build → Artifact Registry → Cloud Run (`us-central1`). Gemini key via Secret Manager. One-command `scripts/deploy.ps1`. CI (GitHub Actions, SHA-pinned) runs audit → type-check → lint → coverage → build, then Playwright e2e.

## Rollback
Cloud Run keeps prior revisions; `gcloud run services update-traffic copa-copilot-api --region=us-central1 --to-revisions=<prev>=100` reverts instantly.
