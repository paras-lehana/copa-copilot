# Feature Catalogue — Copa Copilot

Copa Copilot is a GenAI smart-stadium operations and fan copilot spanning all 16
FIFA World Cup 2026 venues. Every user-facing feature is backed by a deterministic
domain engine (`@copa/core`): the number a fan sees on a card, the minute the exit
advisor recommends, and the CO₂e a mission awards are all reproducible in a unit
test. This document catalogues each feature, the persona it serves, the core module
that powers it, and the API endpoint that exposes it.

For how these pieces fit together, see [System Architecture](./01-architecture.md).
For the assistant's grounding and prompt design, see
[AI Assistant & Grounding Design](./03-ai-assistant.md). For the full request/response
contracts, see the [API Reference](./10-api-reference.md).

---

## 1. How to read this catalogue

Copa Copilot is scoped along two axes — four personas and eight operational dimensions:

- **Four personas** — Fan (mobile-first), Organizer / operations, Volunteer, and
  Venue staff. A single engine result is re-shaped per persona; the weather protocol,
  for example, emits a distinct action list for each of the four roles from one
  evaluation.
- **Eight operational dimensions** — Navigation, Crowd management, Accessibility,
  Transportation, Sustainability, Multilingual assistance, Operational intelligence,
  and Real-time decision support.

Two design rules hold across every feature below:

1. **Determinism.** No module calls `Date.now()` or `Math.random()`. The match
   minute (time relative to kickoff) and a numeric seed are always parameters, so the
   same `(venue, scenario, minute, seed)` tuple returns an identical result forever
   (`packages/core/src/crowd.ts`, `packages/core/src/prng.ts`).
2. **Single source of numbers.** Engine functions compute every figure; UI code and
   the assistant restate engine output rather than inventing it. The dashboard
   (`apps/web/app/page.tsx`) carries the comment *"Every number comes from the API
   (the engine), never hard-coded here."*

Each feature also maps to a documented June–July 2026 tournament failure. Those
incidents are the product's problem statement, described in
[Introduction & Product Overview](./00-introduction.md).

---

## 2. Master feature table

| Feature | Primary persona(s) | Core module | API endpoint |
|---|---|---|---|
| Live crowd, queue & transit snapshot | Fan, Organizer | `crowd.ts` | `GET /api/crowd/:venueId` |
| Transit-load panel | Organizer, Fan | `crowd.ts` | `GET /api/transit/:venueId` |
| Crowd- & accessibility-aware safe routing | Fan, Venue staff | `routing.ts` | `POST /api/routing/recommend` |
| Exit-wave / egress advisor | Fan | `egress.ts` | `POST /api/egress/advice` |
| Staggered-egress plan | Organizer | `egress.ts` | `GET /api/egress/stagger/:venueId` |
| Weather protocol (lightning + heat) | All four | `weather.ts` | `GET /api/weather/:venueId` |
| Entry readiness / ghost-ticket check | Fan | `entry.ts` | `POST /api/entry/assess` |
| Incident triage queue | Volunteer, Organizer | `incidents.ts` | `POST /api/incidents`, `GET /api/incidents/:venueId`, `PATCH /api/incidents/:incidentId/advance` |
| Sustainability tiles & commute compare | Organizer, Fan | `sustainability.ts` | (tiles surfaced via ops briefing; commute math shared with missions) |
| Missions & point math | Fan | `gamification.ts` | `GET /api/missions`, `POST /api/missions/complete` |
| Leaderboards | Fan, Volunteer | `leaderboard.ts` | `GET /api/leaderboard` |
| Multilingual grounded assistant | All four | `assistant` service + all engines | `POST /api/assistant/query` |
| AI operations briefing | Organizer | `briefing` service + all engines | `POST /api/ops/briefing` |
| Venue registry & selection | All four | `venues.ts` | `GET /api/venues`, `GET /api/venues/:venueId` |
| Fan profile bootstrap | Fan | store service | `POST /api/users/bootstrap`, `GET /api/users/:userId` |
| Google-services evidence page | Venue staff / operators | `google/service-catalog.ts` | `GET /api/google/services` |

The web application exposes these across 11 routes (dashboard, onboarding, map,
assistant, ops, volunteer, missions, leaderboard, accessibility, google-services,
plus the root). The remaining sections describe each feature in depth.

---

## 3. Crowd management — live simulation

**Persona:** Fan, Organizer · **Module:** `packages/core/src/crowd.ts` ·
**Endpoints:** `GET /api/crowd/:venueId`, `GET /api/transit/:venueId`

The crowd engine is the substrate the rest of the product reads from. Given a venue,
a scenario, a minute, and a seed, `simulateVenue()` returns a `CrowdSnapshot`: every
zone's density percentage, its three-tier status, and queue minutes at service
points, plus per-link transit load.

Concrete mechanics from the module:

- **Match phases.** `phaseForMinute()` maps a minute to one of seven phases —
  `pre-gates`, `ingress`, `first-half`, `halftime`, `second-half`, `final-whistle`,
  `egress` — with documented boundaries (for example, minute `120` resolves to
  `egress`).
- **Zone status thresholds.** Density at or above `CRITICAL_THRESHOLD` (85) is
  `critical`; at or above `BUSY_THRESHOLD` (55) is `busy`; below that is
  `comfortable`. These constants are exported so tests and UI reference one source.
- **Base occupancy as data.** `BASE_OCCUPANCY` is a `Record<ZoneKind, Record<
  MatchPhase, number>>` — a lookup table, not branching logic — covering gate,
  concourse, section, food-court, hydration, accessible-facility, prayer-room,
  first-aid, and transit-hub kinds.
- **Scenarios replay real incidents.** Four scenarios are available: `normal`,
  `gate-bottleneck`, `egress-surge`, and `weather-hold`. `gate-bottleneck` multiplies
  gate load by 1.45 (the Arrowhead 2-of-7-gates ingress replay); `egress-surge`
  multiplies transit-hub load by 1.35 (the MetLife post-match replay); `weather-hold`
  pushes fans off outdoor sections into concourses (concourse × 1.35, section × 0.7).
- **Queue curve.** `queueMinutesFor()` grows queueing non-linearly with density at
  serviced kinds only (gate, food-court, hydration), using a closed-form curve
  (`2 + 43 × load²`) chosen deliberately over a step-by-step queue simulation for
  determinism and speed.
- **Deterministic jitter.** A seeded ±6-density-point jitter, stable per
  `(seed, venue, zone, minute)`, prevents flat, obviously-synthetic numbers without
  sacrificing reproducibility.

On the fan dashboard the snapshot drives the "Crowd now" bento tile: the busiest
zone, a count of critical zones, and per-zone density meters. `simulateWindow()`
produces a series of snapshots across a minute range (used by the egress and ops
features). The transit portion of the snapshot feeds `GET /api/transit/:venueId` and
is what the egress advisor forecasts against.

---

## 4. Navigation & accessibility — crowd-aware safe routing

**Persona:** Fan, Venue staff · **Module:** `packages/core/src/routing.ts` ·
**Endpoint:** `POST /api/routing/recommend`

`recommendRoute()` computes the *safest* route between two zones under live crowd
conditions — not the shortest. It runs Dijkstra over the per-venue stadium graph with
a composite edge cost of distance × crowd penalty × accessibility penalty. The hard
rule stated at the top of the module: never traverse a `critical` zone unless no
alternative exists, and when that happens, say so explicitly.

### Accessibility profiles change what "best" means

Four profiles are supported (`ACCESSIBILITY_PROFILES`): `none`, `wheelchair`,
`low-vision`, and `sensory-sensitive`. Each alters the route computation rather than
merely relabelling it:

- **Wheelchair — step-free is a hard filter, not a preference.** `edgeCost()` returns
  `undefined` (edge removed from the graph) for any non-step-free edge when the
  profile is `wheelchair`. A wheelchair user is never routed over stairs; if no
  step-free path connects the endpoints the engine returns a typed
  `ROUTE_UNAVAILABLE` (409) error rather than an unusable route.
- **Low-vision — fewer decisions beat raw distance.** A flat cost (`+40`) is charged
  per leg, biasing the result toward routes with fewer turns and decision points.
- **Sensory-sensitive — avoid high-exposure edges.** A `SENSORY_EXPOSURE_PENALTY`
  multiplies edge cost by up to 2.6× on high-crowd-exposure edges, steering toward
  calmer corridors.
- **Walking speed per profile.** ETA uses `WALK_SPEED` (75 m/min for `none`, 60 for
  wheelchair, 55 for low-vision, 70 for sensory-sensitive).

### Crowd avoidance and honest risk

`STATUS_PENALTY` makes crowded paths expensive: `busy` zones cost 1.8× and `critical`
zones cost 50× — effectively forbidden, chosen only when nothing else connects. The
returned `RouteRecommendation.risk` field is one of `safe`, `caution`, or
`unavoidable-critical`. In the last case the engine-computed `explanation` names the
worst zone and its actual density and notes that a steward can assist — it does not
hide that the only path is crowded.

Every leg carries a plain-language `instruction` ("Continue 40 m to …" or "Take the
stairs …"), a `stepFree` flag, and the live status of the destination zone. The
`explanation` quotes real density numbers from the snapshot the route was computed
against, never a hand-written figure. The `Efficiency:` comment notes that graphs are
under 40 nodes, so a linear-scan priority selection is used in place of a binary heap;
route solves stay well under 5 ms and this is benchmarked in tests.

This feature maps to two accessibility dimensions at once: it is the navigation
surface for a fan and the step-free-route verification tool for accessibility and
venue staff. Related conformance work is covered in [Accessibility](./07-accessibility.md).

---

## 5. Transportation — exit-wave / egress advisor

**Persona:** Fan (advice) and Organizer (stagger plan) ·
**Module:** `packages/core/src/egress.ts` ·
**Endpoints:** `POST /api/egress/advice`, `GET /api/egress/stagger/:venueId`

This is the anti-MetLife feature: after Brazil vs. Morocco at MetLife Stadium, fans
were stranded for three hours because transit could not clear the crowd. The advisor
answers "leave at the smart minute" instead of leaving with the whole bowl at once.

### Fan advice — `adviseEgress()`

For a chosen egress mode (`rail`, `bus`, `rideshare`, or `walk`) the advisor projects
exit time at each of eight candidate departure minutes — `DEPARTURE_CANDIDATES` = 75,
82, 90, 98, 105, 115, 125, 135. For each candidate it reads the crowd snapshot at that
minute, finds the transit hub's utilization, and computes a queue as the share of the
crowd contending for that link divided by its peak throughput. The best option is the
one with the lowest projected exit minutes; `minutesSavedVsFullTime` compares it
against leaving at the 105' full-time mark.

The result includes an engine-computed `explanation` that quotes the numbers it used,
for example: *"Leaving at 82' takes ~N min via the rail link; waiting for full time
takes ~M min. You save ~K min."* On the dashboard this powers the "Get my exit advice"
hero card (`apps/web/app/page.tsx`, `loadExit()`), which posts to `/api/egress/advice`
with `mode: 'rail'` and renders the saved-minutes figure directly from
`advice.minutesSavedVsFullTime`.

### Organizer plan — `planStaggeredEgress()`

For operations, the advisor produces a stagger plan: it takes the `egress-surge`
snapshot at minute 115, orders sections busiest-first (they take longest to drain),
and assigns each section a `releaseAtMinute` (108 + index × 4) and a gate to exit
through (gates round-robin). This spreads section releases across gates and minutes so
no single gate or hub absorbs the whole crowd simultaneously — the operational answer
to the egress-surge scenario.

---

## 6. Weather protocol — lightning watch and heat tiers

**Persona:** All four · **Module:** `packages/core/src/weather.ts` ·
**Endpoint:** `GET /api/weather/:venueId`

`evaluateWeatherProtocol()` encodes the tournament's documented weather rules as a
deterministic state machine over a seeded weather feed. It replays real 2026 incidents
through named presets: `clear-day`, `philadelphia-lightning`, `heat-dome`, and
`passing-storm`.

### Lightning state machine

The protocol state is one of `clear`, `lightning-watch`, `suspension`, or
`all-clear`, driven by two published constants:

- `LIGHTNING_RADIUS_MILES` = 8 — FIFA's 8-mile rule.
- `SUSPENSION_MINIMUM_MINUTES` = 30 — the minimum automatic suspension.

The engine scans the deterministic feed for the last strike within 8 miles up to the
current minute. If found, the match is `suspension` until 30 minutes after that last
close strike (the clock restarts on each new close strike), then reads `all-clear` for
the following 10 minutes. A strike within twice the radius (16 miles), with no active
suspension, raises `lightning-watch`. The `philadelphia-lightning` preset reproduces
the June 22 France–Iraq halftime suspension: strikes cluster close between minutes 40
and 75, and evaluating the protocol at minute 50 returns `suspension`.

### Heat tiers

`heatTierFor()` maps the heat index (°F) to a tier using `HEAT_TIER_THRESHOLDS`:
`caution` at 90, `cooling-breaks` at 98, `extreme` at 106; below 90 is `normal`.
Climate-controlled (roofed) venues always report `normal` for heat — only 5 of the 16
venues are roofed, and the venue registry carries a `climateControlled` flag the
engine reads. The `heat-dome` preset produces heat-index readings of 100–110 °F,
replaying the early-July heat dome.

### Per-persona action lists

The distinctive output is that one evaluation emits a distinct action list for each of
the four personas. Both `STATE_ACTIONS` (lightning) and `HEAT_ACTIONS` (heat) are
`Record<state/tier, Record<persona, string[]>>` tables, and `mergeActions()`
concatenates the state and heat lines per persona. During a suspension a fan is told
"shelter in place inside the concourse, do not exit"; a volunteer is told to "move
fans off open sections into concourses, hold exit gates"; an organizer sees "mandatory
suspension in force (8-mile rule), clock restarts on the last strike"; staff are told
to "maximize covered capacity, monitor density." On a `cooling-breaks` heat day the
fan sees hydration guidance while the organizer sees "mandatory cooling breaks each
half, coordinate with match officials."

On the fan dashboard the weather tile renders `protocol.state`, `protocol.heatTier`,
and `protocol.reading.heatIndexF` directly from this endpoint.

---

## 7. Entry readiness — anti-ghost-ticket check

**Persona:** Fan · **Module:** `packages/core/src/entry.ts` ·
**Endpoint:** `POST /api/entry/assess`

`assessEntryReadiness()` addresses the documented "ghost ticket" failure, where fans
who bought through third-party resale arrived to find tickets never transferred and
were denied entry after paying. The module is explicit that it never touches real
ticket APIs — it scores readiness and explains risk honestly, as educational guidance.

The fan supplies four facts (`EntryFacts`): ticket source (`official`,
`official-resale`, or `third-party`), whether the transfer is confirmed in the
official app, whether photo ID is packed, and whether the bag is compliant. The engine
returns:

- **A risk level.** `SOURCE_RISK` seeds a base risk (official and official-resale are
  `low`, third-party is `high`), but the governing rule is the transfer state: an
  **untransferred ticket escalates *any* source to `high` risk** — that is the actual
  failure mode. A transferred third-party ticket de-escalates to `elevated`.
- **A readiness score.** 0–100, the share of a four-item checklist satisfied
  (transfer visible in the official app — blocking; photo ID packed — blocking; bag
  within size policy; ticket screen saved offline).
- **Source-specific guidance.** For third-party purchases the guidance is pointed:
  confirm the transfer *landed* in the official app, a seller's screenshot is not
  entry, and gate staff cannot fix a missing transfer on matchday.
- **An arrival window.** `arrivalWindowFor()` reads the ingress crowd model at minute
  −60 and recommends an earlier, wider window when gates are modelled busier (from
  −150, −120, or −90 minutes, each spanning 45 minutes) — so the advice tracks the
  crowd engine rather than a fixed guess.

`isWithinArrivalWindow()` is exported for reuse by the Beat-the-Rush mission, which
validates that a claimed arrival minute falls inside this window during the `ingress`
phase.

---

## 8. Real-time decision support — incident triage

**Persona:** Volunteer, Organizer · **Module:** `packages/core/src/incidents.ts` ·
**Endpoints:** `POST /api/incidents`, `GET /api/incidents/:venueId`,
`PATCH /api/incidents/:incidentId/advance`

Incidents are reported (a volunteer files a structured report), listed per venue for
the operations queue, and advanced through their lifecycle. The incidents module
handles triage and ordering so the operations view surfaces the most urgent items
first. This feature is the human-in-the-loop counterpart to the automated advisories
above: the assistant can draft a structured summary from a free-text report, and the
ops queue tracks it to resolution. See [AI Assistant & Grounding Design](./03-ai-assistant.md)
for how incident drafting is grounded.

---

## 9. Sustainability — emission math, tiles, and commute compare

**Persona:** Organizer (tiles), Fan (commute choice) ·
**Module:** `packages/core/src/sustainability.ts`

Every kilogram of CO₂e in the product comes from one factor table in this module, via
pure arithmetic. The context is the independent June 2026 estimate that put the
tournament's footprint near 7.8 Mt CO₂e — and the fan-side lever is travel-mode
choice.

- **Emission factors.** `EMISSION_FACTORS_KG_PER_KM` gives kg CO₂e per passenger-km:
  rail 0.038, bus 0.09, rideshare 0.18, walk 0. The comment cites the typical US/UK
  government conversion-factor ranges these sit within, and the values are asserted in
  tests.
- **Commute footprint & comparison.** `commuteFootprint(mode, distanceKm)` returns the
  trip's kg CO₂e and the saving versus doing the same trip by rideshare (the default
  behaviour). `compareCommute(distanceKm)` returns all modes greenest-first — walk
  leads, rideshare trails.
- **Venue tiles.** `sustainabilityTiles()` computes ops-dashboard figures fully
  derived from the crowd engine: waste diverted (follows occupancy), water refills
  (follow hydration-station traffic over elapsed matchday minutes), energy kWh
  (follows occupancy), and kg CO₂e saved by fans choosing transit over rideshare
  (from the transit-hub share of the crowd, assuming ~55% of arrivals use modelled
  transit links for an average 15 km trip).

Because the mission engine imports `commuteFootprint`, the CO₂e a fan is shown when
choosing rail over rideshare is the same number that mints their Green Footprint
points — the figure cannot drift between the two surfaces.

---

## 10. Gamified missions and leaderboard

**Persona:** Fan (missions), Fan and Volunteer (boards) ·
**Modules:** `packages/core/src/gamification.ts`, `packages/core/src/leaderboard.ts` ·
**Endpoints:** `GET /api/missions`, `POST /api/missions/complete`,
`GET /api/leaderboard`

Copa Copilot's gamification is *operational*: every mission binds to an engine metric,
so points always trace to a computed operational outcome rather than raw engagement.

### The mission catalogue

Five missions (`MISSIONS`), each with a validated metric and base points:

| Mission | Metric validated against | Base points |
|---|---|---|
| Beat the Rush | arrival window (`entry.ts`) | 50 |
| Green Footprint | commute mode (`sustainability.ts`) | 30 |
| Smart Exit | egress advice followed | 40 |
| Refill Run | hydration on a heat-protocol day | 20 |
| Route Follow | recommended route compliance | 25 |

### Point math is one source

Two exported formulas are the only place points are computed: `pointsForCo2()` awards
10 points per kg CO₂e saved (rounded), and `pointsForCongestionAvoided()` awards 2
points per minute of queueing skipped. UI copy, mission rewards, and leaderboard
figures all call these, so a displayed number can never diverge from the engine.
`levelForPoints()` resolves a total against an eight-step `LEVELS` curve
(0, 100, 250, 450, 700, 1000, 1350, 1750).

### Honest validation, no minting

`validateCompletion()` checks each claim against its metric and returns a typed error
rather than a silent zero when a claim is invalid. Concrete guards:

- Green Footprint rejects a `rideshare` claim and rejects implausible distances
  (≤ 0 or > 120 km), and awards `basePoints + pointsForCo2(saving vs rideshare)`.
- Smart Exit rejects a departure more than 5 minutes off the advised minute.
- Refill Run only counts when a heat protocol was active.
- Beat the Rush requires the minute to fall inside the arrival window during ingress.
- Route Follow rejects a `pre-gates` minute (matchday only).

Rejections surface as the `MISSION_REJECTED` (422) error code. Separately,
`clampRestoredPoints()` enforces the anti-minting rule: a client-restored point total
is clamped to `MAX_RESTORABLE_POINTS` (2000) and non-finite or non-positive values
normalize to 0, so a tampered client cannot mint points. This control is described in
[Security](./06-security.md).

Leaderboards (`leaderboard.ts`) order participants for section, venue, and
tournament-wide boards and are served by `GET /api/leaderboard`.

---

## 11. Multilingual grounded assistant

**Persona:** All four · **Module:** assistant service + every engine above ·
**Endpoint:** `POST /api/assistant/query`

The conversational assistant is the unifying surface: it answers questions about
routes, queues, exits, weather, and tickets by calling the same engine functions
documented here and grounding its reply in their output. On the dashboard it is
presented as "FlowSphere Assistant — Gemini via llm-service · grounded," with sample
prompts such as "What's the safest route to my seat?", "When should I leave for the
train?", and "Will my resale ticket work?"

Key properties (detailed in [AI Assistant & Grounding Design](./03-ai-assistant.md)):

- **Six languages.** English (`en`), Spanish (`es`), French (`fr`), Arabic (`ar`,
  right-to-left), Hindi (`hi`), and Portuguese (`pt`), resolved via the BCP-47 locale
  logic in `i18n.ts`.
- **Two execution paths, one engine.** In `DEMO_MODE` the assistant produces
  deterministic replies computed by the same `@copa/core` engines, so replies are
  reproducible and the end-to-end suite can assert real numbers. In production
  (`DEMO_MODE=false`) it calls Gemini (`gemini-3-flash`) through the `llm-service`
  proxy and returns `engine: "gemini"`; any upstream failure falls back to the
  deterministic demo path automatically.
- **Grounded and bounded.** Replies are capped at 180 words, input at 1,000
  characters, and the assistant endpoint carries a stricter rate bucket (10 requests
  per minute per IP versus 60 for general endpoints). Engine data is injected as
  verified stadium data behind a per-request nonce boundary, with refusal rules for
  off-domain and personal-data requests.

Because the assistant restates engine output rather than generating figures, a routing
answer quotes the same densities `recommendRoute()` computed and an exit answer quotes
the same saved-minutes `adviseEgress()` computed.

---

## 12. Operational intelligence — AI operations briefing

**Persona:** Organizer · **Module:** briefing service + every engine ·
**Endpoint:** `POST /api/ops/briefing`

The operations briefing gives the control room the same intelligence as the fan
copilot, summarised. It reads the crowd, transit, weather, egress, incident, and
sustainability state for a venue over a recent window and produces a concise briefing
with prioritised actions. The briefing is cached per request with a 60-second TTL to
bound cost and latency, and — like the assistant — runs through Gemini in production
with a deterministic demo fallback. It is the operations-facing dimension of the same
grounded-summarisation design.

---

## 13. Supporting features

### Venue registry and selection

**Module:** `packages/core/src/venues.ts` · **Endpoints:** `GET /api/venues`,
`GET /api/venues/:venueId`

A typed registry of all 16 venues carries each venue's zones, gates, capacity,
transit links, and the `climateControlled` flag the weather engine reads. Onboarding
lets a fan choose venue, seat/zone, language, and accessibility profile; every
downstream feature reads that session (`apps/web/app/page.tsx` uses
`session.venueId`, `session.accessibility`, `session.language`, and
`session.persona`).

### Fan profile bootstrap

**Endpoints:** `POST /api/users/bootstrap`, `GET /api/users/:userId`

Fan profiles are anonymous by design — no PII is collected and the product is
biometric-free. A profile is bootstrapped for session continuity and mission/points
persistence behind a store interface (documented as a Firestore drop-in in
[Google Cloud & Gemini Integration](./08-google-cloud.md)).

### Google-services evidence page

**Module:** `packages/core/src/google/service-catalog.ts` ·
**Endpoint:** `GET /api/google/services`

An evidence-as-code catalogue of 15 Google services (6 implemented, 5 ready-with-key,
4 planned) rendered at the `/google-services` route and served as JSON. The endpoint
exposes environment-variable names only and never secret values. Details are in
[Google Cloud & Gemini Integration](./08-google-cloud.md).

---

## 14. Persona coverage matrix

| Dimension | Fan | Organizer | Volunteer | Venue staff |
|---|---|---|---|---|
| Navigation | Safe routing, map | — | — | Step-free verification |
| Crowd management | Crowd tile | Density & transit panels, stagger plan | Zone status | Zone status |
| Accessibility | Profile-aware routing, RTL/6-lang UI | — | — | Accessible-route checks |
| Transportation | Exit-wave advisor | Staggered-egress plan, transit load | — | — |
| Sustainability | Commute compare, Green Footprint | Sustainability tiles | — | — |
| Multilingual assistance | Assistant (6 languages) | Briefing | Assistant | Assistant |
| Operational intelligence | — | AI ops briefing | Incident reporting | Facility status |
| Real-time decision support | Weather actions, exit timing | Weather actions, incident queue | Weather actions, redirection | Weather actions |

Every operational dimension and every persona is served by at least one engine-backed
feature above. The weather protocol alone touches all four personas from a single
evaluation, and the assistant makes each feature reachable conversationally in six
languages.

---

## 15. Where each feature is proven

Every figure in this catalogue is asserted somewhere in the 1,605-test suite
(1,351 core unit + 160 API integration + 42 web component + 52 end-to-end), with
`@copa/core` at 99.4% statement coverage. The engine modules use matrix tests across
scenarios × profiles × venues × minutes, which is how the constants quoted here
(thresholds, factors, penalties, point formulas) are pinned. For the full breakdown of
what each layer proves, see [Testing Strategy](./05-testing.md); for the deterministic
foundations that make these features reproducible, see
[Domain Model & Determinism](./11-domain-model.md).
