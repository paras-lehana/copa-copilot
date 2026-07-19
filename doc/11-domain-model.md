# Domain Model & Determinism — Copa Copilot

This document describes the domain concepts that Copa Copilot's engine reasons
about — venues, zones, scenarios, minutes, and seeds — and the mechanism that
makes every simulated number reproducible: a seeded pseudo-random number
generator (PRNG) and a strictly parameterised simulation. Everything described
here lives in the pure domain package `@copa/core` (`packages/core/src`), which
has no runtime dependency beyond `zod ^3.24` and never reads a clock or a
non-deterministic random source.

For how these concepts flow through the system, see
[System Architecture](./01-architecture.md). For the request/response
contracts that expose them over HTTP, see the
[API Reference](./10-api-reference.md).

---

## 1. Why determinism is the foundation

The engine is built on one non-negotiable rule, stated at the top of every
stochastic module:

> Core never calls `Math.random()` or `Date.now()`. Every stochastic value flows
> from a caller-supplied seed, and the passage of time is expressed as an
> explicit match-relative minute parameter.

The consequences of that rule are what make the product auditable:

- **Reproducibility.** The tuple `(venue, scenario, minute, seed)` maps to
  exactly one crowd snapshot, forever. Re-running the same query on any machine,
  in any timezone, at any wall-clock time yields byte-identical output.
- **Testability.** Because outputs are pure functions of their inputs, every
  number a user can see on screen is assertable in a unit test. The `@copa/core`
  suite contains 1,351 unit tests and holds 99.4% statement coverage; the
  coverage gate requires lines/statements/functions ≥ 95% and branches ≥ 90%.
- **No fake randomness.** The simulation does not fabricate liveness by wobbling
  numbers with an unseeded generator. Any variation the UI shows is derived
  deterministically from the seed, so a "busy gate" stays busy on reload and a
  reviewer can trace the number back to its source constants.

`Math.random()` and `Date.now()` are, in effect, banned inside the domain core;
the demo and live paths described in the [AI Assistant](./03-ai-assistant.md)
document both consume the same deterministic engine, which is why the
zero-key demo mode produces coherent, testable behaviour rather than noise.

---

## 2. The seeded PRNG (`prng.ts`)

`packages/core/src/prng.ts` is the smallest and most load-bearing module in the
core. It exposes three functions and one type.

### 2.1 `createRng(seed)` — the generator

```ts
export type Rng = () => number;
export function createRng(seed: number): Rng;
```

`createRng` implements **mulberry32**, a compact 32-bit PRNG. It seeds an
internal state from a 32-bit integer (`seed >>> 0`) and returns a closure that,
on each call, advances the state and emits a float in `[0, 1)`:

```ts
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

The same seed always yields the same sequence: `createRng(26)()` equals
`createRng(26)()` on every invocation. This is the property that makes every
simulated crowd, queue, and weather value assertable.

### 2.2 `deriveSeed(seed, key)` — independent sub-streams

```ts
export function deriveSeed(seed: number, key: string): number;
```

A single top-level seed would couple every zone's jitter together. `deriveSeed`
folds a string key into the parent seed using an FNV-style multiply-and-xor hash
(`Math.imul(hash ^ key.charCodeAt(i), 0x01000193)`), producing a stable
sub-seed. Each venue/zone/minute combination therefore gets its own
independent-but-reproducible random stream. For example
`deriveSeed(26, 'metlife:gate-d')` always returns the same 32-bit value.

### 2.3 `range(rng, min, max)` — bounded draws

```ts
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
```

A convenience that maps a `[0, 1)` draw onto `[min, max)`. The crowd simulation
uses it to produce bounded density jitter (see §5.3).

**Design note.** The seed is an ordinary function parameter, not global state.
There is no hidden singleton generator; two concurrent requests with different
seeds never interfere, and the engine has no warm-up or reset semantics to get
wrong.

---

## 3. The venue registry (`venues.ts`)

`packages/core/src/venues.ts` is the single source of truth for the 16 host
stadiums of the 2026 tournament. Its data is curated demo data — capacities and
transit links compiled from public July 2026 coverage — shaped for the
simulation engine rather than a live FIFA feed, and the UI states that boundary
explicitly.

### 3.1 The `VenueId` union

Venue identity is a closed string-literal union of 16 host-city-based ids:

```
metlife, att-dallas, arrowhead, nrg-houston, mercedes-benz-atlanta,
sofi-la, levis-bayarea, lincoln-philadelphia, lumen-seattle,
gillette-boston, hardrock-miami, bcplace-vancouver, bmo-toronto,
azteca-mexicocity, bbva-monterrey, akron-guadalajara
```

Because `VenueId` is a literal union, an unknown id cannot enter the engine
through the type system, and the `venueIdSchema` (see §6) rejects it at runtime.

### 3.2 The `Venue` shape

Each entry in the `VENUES` record carries:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `VenueId` | Stable identifier |
| `name` | `string` | Display name (e.g. `New York New Jersey Stadium (MetLife)`) |
| `city` | `string` | Host city |
| `country` | `'USA' \| 'Canada' \| 'Mexico'` | Host nation |
| `capacity` | `number` | Nominal seated capacity |
| `climateControlled` | `boolean` | Roofed venues bypass the heat protocol |
| `timezone` | `string` | IANA zone (display only; the engine never reads it as a clock) |
| `gates` | `readonly string[]` | Gate ids |
| `transit` | `readonly TransitLink[]` | How fans arrive |
| `flagship` | `boolean` | Whether the venue carries the deep hand-modelled graph |

A `TransitLink` records `mode` (`'rail' \| 'bus' \| 'rideshare' \| 'walk'`), a
`name`, `walkMinutes` from the hub to the nearest gate, and
`peakThroughputPerMinute` — the people-per-minute the link can move at peak,
which drives both transit-wait math and egress modelling.

### 3.3 Constants-as-data, not branching

A deliberate structural rule holds across the whole core: **no conditional
anywhere branches on a venue id.** Per-venue differences are expressed purely as
data in the registry. This keeps behaviour uniform and testable — adding or
correcting a venue is a data edit, never a control-flow edit.

Two derived constants are exported for convenience and are asserted in tests:

- `VENUE_IDS` — all ids in registry order.
- `CLIMATE_CONTROLLED_COUNT` — computed by filtering the registry; equals **5**
  (AT&T Dallas, NRG Houston, Mercedes-Benz Atlanta, SoFi, and BC Place
  Vancouver). The tournament reality that only 5 of 16 stadiums are
  climate-controlled is encoded here and consumed by the heat protocol.

`getVenue(id)` performs a safe lookup returning `Venue | undefined`, so an
unknown id degrades to a not-found result rather than a throw.

### 3.4 Selected registry facts

| Venue | City | Capacity | Climate-controlled | Flagship |
| --- | --- | --- | --- | --- |
| MetLife | East Rutherford | 82,500 | no | **yes** |
| Estadio Azteca (Banorte) | Mexico City | 83,264 | no | no |
| AT&T (Dallas) | Arlington | 80,000 | yes | no |
| Arrowhead | Kansas City | 76,400 | no | no |
| SoFi | Inglewood | 70,240 | yes | no |
| BMO Field | Toronto | 45,736 | no | no |

MetLife is the sole flagship because it hosts the July 19 final; Arrowhead
carries seven gates (`gate-a` … `gate-g`), which is what makes it a natural fit
for the gate-bottleneck scenario (§4.2).

---

## 4. Stadium graphs (`stadium-graph.ts`)

`packages/core/src/stadium-graph.ts` turns each venue into a navigable
`StadiumGraph` of zones and walkable edges. Graph construction is pure — no
randomness, no clocks — so identical venue data always produces an identical
graph.

### 4.1 Zones

A `Zone` is one navigable place inside a venue:

```ts
interface Zone {
  readonly id: string;
  readonly name: string;
  readonly kind: ZoneKind;
  readonly capacity: number;   // nominal people capacity for the density model
  readonly outdoor: boolean;   // matters under weather protocols
}
```

`ZoneKind` is a closed set of nine categories the simulation and routing both
understand:

```
gate, concourse, section, food-court, hydration,
accessible-facility, prayer-room, first-aid, transit-hub
```

The `outdoor` flag is what lets the weather protocol and the `weather-hold`
scenario move crowds off exposed zones into sheltered concourses.

### 4.2 Edges

A `GraphEdge` is a walkable connection with the attributes routing needs:

```ts
interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly meters: number;
  readonly stepFree: boolean;          // false = stairs / lift-dependency (wheelchair-blocking)
  readonly crowdExposure: CrowdExposure; // 'low' | 'medium' | 'high'
  readonly outdoor: boolean;
}
```

Edges are stored **directed in both directions** — the `link()` helper emits a
pair `(from→to)` and `(to→from)` with identical attributes — so the routing
Dijkstra scan can traverse the graph either way. `crowdExposure` feeds the
routing crowd penalty; `stepFree` is what makes accessibility-aware routing
possible.

### 4.3 Two graph builders

`buildStadiumGraph(venueId)` dispatches on the `flagship` flag:

- **MetLife (flagship): `buildMetlifeGraph`.** A hand-modelled layout: 5 gates,
  4 concourses (N/E/S/W), 8 seating sections across three tiers, plus food
  courts, hydration stations, an accessible-facilities node, a prayer room,
  first aid, and two transit hubs (Meadowlands Rail and the Bus & Coach Plaza).
  The upper-tier sections (`sec-224`, `sec-248`, `sec-324`, `sec-345`) are
  modelled with **two** edges each: a shorter stairs route (`stepFree: false`)
  and a longer lift route (`stepFree: true`). This guarantees a wheelchair
  profile always has a lawful path to every section.

- **All other 15 venues: `buildGeneratedGraph`.** A generated four-quadrant
  ring. Gates feed the concourse in their quadrant (cycled with
  `i % 4`), the four concourses form a ring, and each quadrant gets one section
  sized at `Math.round(venue.capacity / 8)`. The southern and western sections
  again receive both a stairs route and a longer lift route, preserving the
  step-free guarantee tournament-wide.

### 4.4 Memoisation

Graphs are static per process, so `buildStadiumGraph` memoises into a
`Map<VenueId, StadiumGraph>`: the graph is built once per venue per process and
reused thereafter. This is an efficiency choice, not a correctness one — because
construction is pure, a rebuilt graph would be identical to the cached one.
`buildStadiumGraph` returns `undefined` for an unknown venue id.

---

## 5. Crowd snapshots (`crowd.ts`)

`packages/core/src/crowd.ts` is the deterministic crowd, queue, and transit-load
simulation. Its contract is the heart of the domain model:

> `simulateVenue(venueId, scenario, minute, seed)` returns one `CrowdSnapshot`,
> and the same four inputs always return an identical snapshot.

### 5.1 Match-relative minutes and phases

Time in the engine is a **minute relative to kickoff**: negative values are
before kickoff, `0` is kickoff. There is no wall clock; the minute is always a
parameter. `phaseForMinute(minute)` maps the minute onto a `MatchPhase`:

| Minute range | Phase |
| --- | --- |
| `minute < -120` | `pre-gates` |
| `-120 ≤ minute < 0` | `ingress` |
| `0 ≤ minute < 45` | `first-half` |
| `45 ≤ minute < 60` | `halftime` |
| `60 ≤ minute < 105` | `second-half` |
| `105 ≤ minute < 115` | `final-whistle` |
| `minute ≥ 115` | `egress` |

The valid minute domain is bounded by the shared `minuteSchema` (§6):
**gates open at −240 at the earliest, and egress ends by +240.** `MATCH_PHASES`
exports all seven phases in chronological order for matrix tests and UI pickers.

### 5.2 Scenarios

`ScenarioId` is a closed set of four named demo scenarios, exported as
`SCENARIOS`:

| Scenario | Models | Effect (multipliers by zone kind) |
| --- | --- | --- |
| `normal` | Baseline matchday | none (all multipliers 1) |
| `gate-bottleneck` | Arrowhead ingress failure (June 16, too few gates open) | `gate ×1.45`, `concourse ×1.15`, `transit-hub ×1.2` |
| `egress-surge` | MetLife post-match egress collapse | `gate ×1.25`, `transit-hub ×1.35`, `concourse ×1.1` |
| `weather-hold` | Shelter-in-place under the weather protocol | `concourse ×1.35`, `section ×0.7`, `gate ×0.5`, `transit-hub ×0.6` |

Two of these replay real, documented 2026 incidents — the Arrowhead ingress
backup and the MetLife egress collapse — so the simulation demonstrates its
value against situations that actually occurred. `weather-hold` inverts the
usual flow, pulling fans off outdoor gates and sections into sheltered
concourses.

### 5.3 How a snapshot is computed

For a given `(venueId, scenario, minute, seed)`, `simulateVenue` performs a pure
computation:

1. **Resolve inputs.** Look up the `Venue` and build (or fetch the memoised)
   `StadiumGraph`. If either is missing, return `undefined`. Compute the phase
   via `phaseForMinute`.
2. **For each zone,** combine three deterministic factors:
   - a **base occupancy** from the `BASE_OCCUPANCY[kind][phase]` table (a
     constants-as-data matrix of zone-kind × phase fractions, e.g. a `gate` is
     `0.85` full during `ingress` but `0.05` `pre-gates`), scaled to a
     percentage;
   - a **scenario multiplier** from `SCENARIO_MULTIPLIER[scenario][kind]`,
     defaulting to `1` where a scenario leaves a kind untouched;
   - a **deterministic jitter** of ±6 density points from
     `jitter(seed, venueId, zoneId, minute)`, which builds a sub-seed via
     `deriveSeed` and draws through `range(rng, -6, 6)`.

   The three are summed and clamped to `[0, 100]` via `clampPct` (round, floor
   at 0, cap at 100).
3. **Derive status and queue.** `statusFor(densityPct)` maps density to a
   three-tier `ZoneStatus` using the exported thresholds
   `BUSY_THRESHOLD = 55` and `CRITICAL_THRESHOLD = 85` (≥ 85 → `critical`,
   ≥ 55 → `busy`, else `comfortable`). `queueMinutesFor` applies a closed-form
   non-linear curve, `Math.round(2 + 43 * load²)` where `load = densityPct/100`,
   but only at serviced kinds (`gate`, `food-court`, `hydration`); every other
   kind reports `0` queue minutes. The curve is a deliberate efficiency choice —
   indistinguishable from a full queue simulation at demo scale and fully
   deterministic.
4. **For each transit link,** compute utilisation from the same base/multiplier/
   jitter recipe on the `transit-hub` kind, then a `waitMinutes` that scales with
   utilisation and inversely with the link's `peakThroughputPerMinute`:
   `round((util/100) * (capacity / 40 / throughput) + 2)`.

The result is a `CrowdSnapshot`:

```ts
interface CrowdSnapshot {
  readonly venueId: VenueId;
  readonly minute: number;
  readonly phase: MatchPhase;
  readonly scenario: ScenarioId;
  readonly zones: readonly ZoneCrowd[];
  readonly transit: readonly TransitLoad[];
}
```

Because the jitter is keyed on `seed`, `venueId`, `zoneId`, and `minute`, each
cell of the snapshot has its own reproducible stream: two zones never share a
jitter value by accident, and re-querying the same minute reproduces the exact
same density everywhere.

### 5.4 Windowed simulation

`simulateWindow(venueId, seed, fromMinute, toMinute, stepMinutes = 5, scenario = 'normal')`
walks a closed minute range at a fixed step and collects the snapshots — the
basis for the time-series views. For example, stepping MetLife from minute 105
to 135 in steps of 10 under `egress-surge` yields four snapshots (105, 115, 125,
135).

### 5.5 A worked contract

The doc-comment on `simulateVenue` states an assertable invariant that the test
suite pins:

```ts
const snap = simulateVenue('metlife', 'egress-surge', 120, 26);
snap?.zones.find((z) => z.kind === 'transit-hub')?.status; // 'critical'
```

At minute 120 the phase is `egress`; the `transit-hub` base occupancy is `0.98`,
multiplied by the `egress-surge` hub factor `1.35` and jittered by a value
derived from seed 26 — a chain that lands, deterministically, in the `critical`
band. That is the whole point of the design: the number on the screen is the
same number in the test.

---

## 6. Shared schema contracts (`schemas.ts`)

`packages/core/src/schemas.ts` is the **single zod schema source** for both the
API and the web forms. The web layer never hand-mirrors these bounds; it imports
them, so a validation rule can never drift between client and server. The
[API Reference](./10-api-reference.md) documents each endpoint's contract; this
section covers the domain-level invariants.

### 6.1 Strictness and safe errors

Every request schema is declared `.strict()`, so unknown keys are rejected
rather than silently ignored — the tampering control described in
[Security](./06-security.md). A shared `safeErrorMap` is installed so validation
messages report **which** field failed and a why-category, but never echo the
offending value. For enum failures it returns
`Field "<path>" is not one of the allowed values.`; for unknown keys,
`The request contains fields that are not allowed.`. This is the
no-raw-input-echo rule expressed as code, and a test asserts no secret or raw
value ever appears in an error.

Display strings use a `displayText(max)` helper that trims, bounds length, and
rejects markup via the `^[^<>]*$` pattern — defence-in-depth against stored XSS.

### 6.2 Enum-from-const bridging

Domain option lists (`VENUE_IDS`, `SCENARIOS`, `EGRESS_MODES`, and so on) are
readonly const arrays owned by their domain modules. A single documented helper,
`enumFromConst`, performs the one tuple assertion zod needs so every schema
infers literal union types. This keeps the API layer free of `as` casts end to
end — the venue, scenario, and other enums validated at the edge are the very
same unions the engine consumes.

### 6.3 Key domain bounds

| Constant / schema | Bound | Purpose |
| --- | --- | --- |
| `minuteSchema` | integer, `−240 … 240` | Match-relative minute domain: gates open at −240, egress ends by +240 |
| `ASSISTANT_INPUT_MAX_CHARS` | `1000` | Assistant message cap — also an efficiency control on model spend |
| `DISPLAY_NAME_MAX_CHARS` | `30` | Display-name budget |
| `venueIdSchema` | enum over `VENUE_IDS` | Only the 16 known venues |
| `scenarioSchema` | enum over `SCENARIOS` | Only the 4 known scenarios |
| `crowdQuerySchema` | `scenario` default `normal`, `minute` default `30` | Crowd endpoint contract |
| `briefingRequestSchema` | `windowMinutes` `5 … 60`, default `15` | Operations briefing window |
| `bootstrapSchema` | `claimedPoints` `0 … 1_000_000`, default `0` | Client-claimed points, later clamped server-side (anti-minting) |

Defaults matter to determinism: because `crowdQuerySchema` defaults `scenario`
to `normal` and `minute` to `30`, an unparameterised crowd query is still a
fully specified, reproducible tuple — there is no implicit "now".

`ALL_REQUEST_SCHEMAS` collects every request schema so an invariant test can
assert the whole set is simultaneously strict and safe. The inferred
`z.infer<>` types (`CrowdQuery`, `RoutingRequest`, `AssistantQuery`, and the
rest) are the single type source consumed by both the API and the web app.

---

## 7. How the pieces compose

A crowd query travels a single deterministic path from the network edge to a
snapshot:

```
HTTP request
  → zod (schemas.ts): venueId, scenario, minute validated & defaulted
  → getVenue(venueId)            (venues.ts)     — resolve registry entry
  → buildStadiumGraph(venueId)   (stadium-graph.ts) — memoised zones + edges
  → phaseForMinute(minute)       (crowd.ts)      — minute → phase
  → per zone/link:
       BASE_OCCUPANCY × SCENARIO_MULTIPLIER
       + jitter(deriveSeed(seed, key) → createRng → range)  (prng.ts)
       clamp, status, queue
  → CrowdSnapshot
```

Every arrow in that chain is a pure function of its inputs. There is no shared
mutable state (beyond the read-only graph cache), no clock, and no unseeded
randomness. The same request returns the same snapshot on every machine and at
every hour — which is exactly why the product can claim that every UI number is
reproducible in a unit test.

---

## 8. Related documents

- [System Architecture](./01-architecture.md) — where the core sits in the
  monorepo and the request lifecycle around it.
- [Feature Catalogue](./02-features.md) — the features these domain concepts
  power, by persona and dimension.
- [AI Assistant & Grounding Design](./03-ai-assistant.md) — how the assistant
  grounds on deterministic snapshots and the demo/live paths.
- [Testing Strategy](./05-testing.md) — the layers and counts that verify the
  invariants above.
- [Security](./06-security.md) — the strictness, safe-error, and anti-minting
  controls seen in `schemas.ts`.
- [API Reference](./10-api-reference.md) — the endpoints that expose these
  contracts.
