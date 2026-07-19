# Introduction & Product Overview — Copa Copilot

## What Copa Copilot is

Copa Copilot is a GenAI smart-stadium operations and fan copilot that spans all
16 venues of the FIFA World Cup 2026. It gives four groups of people — fans,
organizers, volunteers, and venue/accessibility staff — a single conversational,
multilingual assistant that understands live crowd density, transit load,
weather, egress, entry-readiness, and sustainability conditions, and turns that
understanding into concrete next actions. Every answer the assistant returns is
grounded in a deterministic domain engine (`@copa/core`) that simulates those
stadium conditions from a seed and a match minute, so every number shown in the
interface is reproducible in a unit test. The product runs end to end with **zero
API keys** in `DEMO_MODE`, and the live production deployment runs real Gemini
(`gemini-3-flash`) through an OpenAI-compatible `llm-service` proxy, returning
`engine: "gemini"` from the assistant endpoint.

Copa Copilot is a TypeScript-strict, npm-workspaces monorepo with three
deployable parts:

- **`@copa/core`** — a pure domain engine with `zod` as its only runtime
  dependency. It holds all simulation and decision logic and has no knowledge of
  HTTP, React, or any cloud service.
- **`@copa/api`** — an Express 4 REST API deployed to Google Cloud Run.
- **`@copa/web`** — a Next.js 15 / React 19 web application, also deployed to
  Cloud Run.

The application package reports version `0.2.0` from `GET /api/meta`; the latest
git tag is `v0.4.0`. The full architecture is described in
[System Architecture](./01-architecture.md).

## The vision

Stadium operators at the 2026 tournament already run sophisticated technology:
Lenovo-class digital twins of all 16 venues feed command-center dashboards with
crowd-flow, security, and technical-systems data, and crowd-analytics platforms
add predictive occupancy views. What that stack does not provide is a
**context-aware, multilingual, per-stakeholder reasoning layer**. Control rooms
see the aggregate picture; individual fans, volunteers on the ground, and
accessibility staff do not get a personalized, plain-language answer to "where do
I go now, and why."

Existing fan-facing tools tend to be one of two things: a ticket wallet with a
static map, or an operations dashboard built for a control room. Neither reasons
about a specific person's situation — their gate, their seat, their accessibility
profile, their language, the current weather protocol — and neither explains its
recommendation in terms of live conditions.

Copa Copilot is designed to be that reasoning layer. It sits on top of
digital-twin-class data (which it simulates deterministically rather than
ingesting from live sensors) and gives every stakeholder a copilot that reasons
over the same live picture the operations room sees, tailored to who is asking.

## The real-world problem

The June–July 2026 tournament (June 11 – July 19, 2026, across the USA, Canada,
and Mexico, 48 teams, 16 venues) surfaced operational failures that are
documented, not hypothetical. Copa Copilot's feature set maps directly onto these
incidents.

### Egress and transit collapse

Three hours after Brazil vs. Morocco at MetLife Stadium, spectators were still
stranded because NJ Transit could not move the crowd. The regular $12.90 rail
fare was surged to $150, then cut to $98 after public backlash. A separate study
of Arrowhead Stadium (which has no rail access) projected that a normal 32-minute
airport drive would balloon to 136 minutes. Source:
[Wikipedia, "List of 2026 FIFA World Cup controversies"](https://en.wikipedia.org/wiki/List_of_2026_FIFA_World_Cup_controversies).
Copa Copilot answers this with the **exit-wave advisor** (`egress.ts`) — the
anti-MetLife feature — which recommends when to leave and which gate to use,
with a transit-load forecast.

### Ingress and gate-operations failure

On June 16, at Argentina–Algeria (Arrowhead), FIFA opened only 2 of the complex's
7 entrances; the result was hours of backup, with fans abandoning cars and
walking over a mile to reach kickoff. The Kansas City host committee formally
petitioned FIFA for more gates. Source:
[KCUR, 2026-06-19](https://www.kcur.org). Copa Copilot addresses this with
gate-load balancing guidance for organizers and volunteer redirection support.

### Weather-protocol handling

FIFA's protocol suspends play for at least 30 minutes when lightning is detected
within an 8-mile radius. France–Iraq (Philadelphia, June 22) was suspended at
halftime for more than two hours after 14 lightning strikes within 8 miles;
Mexico–England (Estadio Azteca, July 5) drew a shelter-in-place delay. A heat
dome pushed RealFeel readings to 100–110°F at Philadelphia, Dallas, Atlanta, and
Kansas City, and only 5 of the 16 stadiums are climate-controlled. FIFA imposed
mandatory cooling and hydration breaks, with wet-bulb temperatures exceeding
Qatar 2022. Source: AccuWeather live blog (coverage through 2026-07-11). Copa
Copilot models this in a weather-protocol state machine (`weather.ts`) covering
the 8-mile lightning rule and heat tiers, with per-persona actions.

### Ticket-trust and entry denials

Fans buying through third-party resale (StubHub, SeatGeek, Vivid Seats) found
that "ghost tickets" were never transferred, and were denied entry at the gate
after paying around $1,000. Source:
[footballgroundguide, 2026-06-23](https://www.footballgroundguide.com).
Official ticketing was also fragmented into a separate app
(`io.tixngo.app.fifatickets`) with verification-code loops that locked users out;
the US listing sat around 2.9 stars during the tournament. Separately, FIFA
attributed visibly empty seats to ticketed fans lingering in concourses — an
in-stadium distribution and monitoring gap (source: Yahoo). Copa Copilot responds
with an **entry-readiness checklist** (`entry.ts`) that gives anti-ghost-ticket
guidance. It deliberately does **not** touch real ticket or turnstile APIs — this
is guidance and simulation only.

### Sustainability blind spot

An independent June 2026 estimate by Greenly put the tournament's footprint at
approximately 7.8 Mt CO2e — more than double Qatar 2022's official figure — yet
fans see none of this operationally. Source: Greenly, via the Wikipedia 2026 WC
controversies page. Copa Copilot exposes emission math (`sustainability.ts`) and
ties it to operational missions, so a fan's choices (transit over rideshare, for
example) produce a computed CO2e figure.

### Accessibility and multilingual gaps

Accessible-stadia research consistently documents poor signage, unclear
accessible routes, and a lack of real-time assistance for wheelchair and
low-vision fans; language barriers compound transit confusion for international
visitors. Copa Copilot treats accessibility as a routing and assistant-behaviour
input (wheelchair, low-vision, and sensory-sensitive profiles change the computed
route) and ships in six languages including right-to-left Arabic.

### The pivot

Every incumbent tool the research surveyed is either a static wallet-plus-map or a
control-room dashboard. None gives individual stakeholders a context-aware,
multilingual, GenAI copilot grounded in reproducible engine data. Copa Copilot is
that layer. The domain concepts behind the simulation — venues, zones, scenarios,
seeds — are documented in the [Domain Model & Determinism](./11-domain-model.md)
section.

## The four personas

Copa Copilot serves four stakeholder groups. Each receives value tuned to its
situation and device context.

| Persona | Primary surface | Value received |
|---|---|---|
| **Fan** | Mobile-first web app | Crowd-aware safest-route navigation (not shortest-path), an exit-wave advisor that recommends when and where to leave, an entry-readiness checklist, multilingual conversational help, and operational missions with computed points. |
| **Organizer / operations** | Desktop-oriented dashboard | Venue-wide density and gate-load view, incident queue, weather-protocol status, transit-load panel, and a one-click AI operations briefing summarizing the recent window with recommended actions. |
| **Volunteer** | Mobile, simplified | Assigned-zone context, live redirection guidance generated in the volunteer's language, and incident quick-reporting. |
| **Venue / accessibility staff** | Mobile / desktop | Step-free route verification, accessible-facility status, and quiet-route suggestions for sensory-sensitive fans. |

The complete, per-persona feature breakdown lives in the
[Feature Catalogue](./02-features.md).

## The eight coverage dimensions

Copa Copilot covers eight operational dimensions. Each is backed by one or more
engine modules in `@copa/core`, which is why every dimension is testable rather
than merely asserted.

| # | Dimension | Backing engine(s) |
|---|---|---|
| 1 | **Navigation** | `stadium-graph.ts`, `routing.ts` (crowd- and accessibility-aware safest route via a linear-scan Dijkstra) |
| 2 | **Crowd management** | `crowd.ts` (seeded crowd/queue/transit simulation), `incidents.ts` |
| 3 | **Accessibility** | `routing.ts` profiles, `a11y/wcag-catalog.ts` (evidence-as-code WCAG catalogue) |
| 4 | **Transportation** | `crowd.ts` transit simulation, `egress.ts` transit-load forecast |
| 5 | **Sustainability** | `sustainability.ts` (emission / CO2e math), `gamification.ts` |
| 6 | **Multilingual assistance** | `i18n.ts` (6-language BCP-47 locale resolution) |
| 7 | **Operational intelligence** | `incidents.ts`, the ops-briefing service, `leaderboard.ts` |
| 8 | **Real-time decision support** | `egress.ts`, `weather.ts`, `entry.ts`, and the grounded assistant |

The six user-interface languages are English (`en`), Spanish (`es`), French
(`fr`), Arabic (`ar`, right-to-left), Hindi (`hi`), and Portuguese (`pt`).

## The core design principle: grounded, reproducible answers

The principle that ties the whole product together is that **every AI answer is
grounded in a deterministic, reproducible stadium engine**.

`@copa/core` is a pure domain engine. It uses no `Date.now()` and no
`Math.random()`: the current match minute (time) and a seed are always passed in
as parameters. A seeded PRNG (`prng.ts`) replaces randomness, so the same inputs
always produce the same crowd snapshot, the same recommended route, and the same
exit advice. This has three consequences that define the product:

1. **Every UI number is testable.** The core carries 1,351 unit tests at roughly
   99.4% statement coverage, and the full suite across all four layers totals
   1,605 tests. See [Testing Strategy](./05-testing.md).
2. **The assistant cannot invent numbers.** In production, the Gemini-backed
   assistant is grounded with `VERIFIED_STADIUM_DATA` computed by the same
   engines, behind a prompt-injection boundary. In `DEMO_MODE`, replies are
   produced deterministically from those same engines, so the demo is fully
   reproducible and the end-to-end suite asserts real values. Any upstream
   failure in the live path automatically falls back to the deterministic demo
   path. This is detailed in
   [AI Assistant & Grounding Design](./03-ai-assistant.md).
3. **The engine is the single source of truth.** The API validates every request
   and response against one shared `zod` schema source (`schemas.ts`), and the
   web application imports those same schemas rather than re-declaring them, so
   contract drift becomes a parse error rather than a silent bug.

The engine modules are:

```
prng.ts             seeded deterministic PRNG (no Math.random)
result.ts           Result<T, AppError> channel
errors.ts           AppError taxonomy + safe localized messages
i18n.ts             6-language BCP-47 locale resolution
venues.ts           16-venue registry
stadium-graph.ts    per-venue stadium graphs
crowd.ts            seeded crowd/queue/transit simulation
routing.ts          crowd- & accessibility-aware safest route (linear-scan Dijkstra)
egress.ts           exit-wave advisor (anti-MetLife)
weather.ts          8-mile lightning + heat-tier protocol state machine
incidents.ts        incident triage / ordering
entry.ts            entry-readiness / anti-ghost-ticket
sustainability.ts   emission / CO2e math
gamification.ts     missions + point math (clampRestoredPoints)
leaderboard.ts      leaderboard ordering
schemas.ts          one shared zod schema source (safeErrorMap)
index.ts            package barrel
a11y/wcag-catalog.ts        evidence-as-code WCAG catalogue (14 criteria)
google/service-catalog.ts   evidence-as-code Google service catalogue (15 services)
```

## Live deployment at a glance

- **Web** — <https://copa-copilot-web-767171449038.us-central1.run.app>
- **API** — <https://copa-copilot-api-767171449038.us-central1.run.app>
- **Service metadata** —
  `GET /api/meta` returns `{"service":"copa-copilot-api","version":"0.2.0",...}`
- **Repository** — <https://github.com/paras-lehana/copa-copilot>

The deployment target is the Google Cloud project `copa-copilot-prod`
(project number `767171449038`) in region `us-central1`. Cloud Run is configured
with `--max-instances=3` and scale-to-zero. Full build, deploy, and observability
details are in [Deployment & Operations](./09-deployment.md).

## How to read this documentation

This document is the entry point. The rest of the set is organized so that a new
engineer or an auditor can move from concept to implementation detail.

| Document | What it covers |
|---|---|
| [00 — Introduction & Product Overview](./00-introduction.md) | This document: what Copa Copilot is, the problem, the personas, and the eight dimensions. |
| [01 — System Architecture](./01-architecture.md) | The monorepo, the three packages, the deterministic core, the request/response flow, and the error model. |
| [02 — Feature Catalogue](./02-features.md) | Every user-facing feature, organized by persona and by dimension, with the engine behind each. |
| [03 — AI Assistant & Grounding Design](./03-ai-assistant.md) | Tools-first grounding, Gemini via the `llm-service` proxy, the prompt-injection boundary, honest engine labelling, and the demo fallback. |
| [04 — Code Quality & Engineering Standards](./04-code-quality.md) | Determinism, the single schema source, data-driven dispatch, typing discipline, one styling system, and hygiene gates. |
| [05 — Testing Strategy](./05-testing.md) | The four test layers, their counts, coverage gates, and what each proves. |
| [06 — Security](./06-security.md) | The STRIDE-lite threat model, defence-in-depth layers, secret management, the error envelope, and responsible-AI controls. |
| [07 — Accessibility](./07-accessibility.md) | WCAG 2.1 AA conformance (catalogued against WCAG 2.2 criteria), the in-app settings panel, the evidence-as-code catalogue, inclusive engine behaviour, and internationalization. |
| [08 — Google Cloud & Gemini Integration](./08-google-cloud.md) | The Google services used, how each is integrated, and the evidence-as-code service catalogue. |
| [09 — Deployment & Operations](./09-deployment.md) | How the product is built and deployed to Cloud Run, the CI pipeline, environments, configuration, secrets, and observability. |
| [10 — API Reference](./10-api-reference.md) | The REST API: endpoints, request/response contracts, error codes, and rate limits. |
| [11 — Domain Model & Determinism](./11-domain-model.md) | Venues, zones, scenarios, and seeds, and how the deterministic simulation produces reproducible results. |

A reasonable reading order for a new engineer is: this introduction →
[Architecture](./01-architecture.md) → [Domain Model](./11-domain-model.md) →
[Features](./02-features.md) → [AI Assistant](./03-ai-assistant.md), then the
quality, testing, security, accessibility, and deployment sections as needed. An
auditor may prefer to start with [Security](./06-security.md),
[Testing](./05-testing.md), and [Accessibility](./07-accessibility.md), each of
which cites the exact files and tests that support its claims.
