# Code Quality & Engineering Standards — Copa Copilot

This document is the canonical reference for the engineering standards that keep the
Copa Copilot codebase consistent, reviewable, and safe to change. It describes the
constraints the code is written under — not aspirations, but rules that are enforced by
tooling and would fail a build if broken.

Copa Copilot is a TypeScript-strict `npm`-workspaces monorepo with three workspaces:

| Workspace | Package | Role |
|-----------|---------|------|
| `packages/core` | `@copa/core` | Pure `zod`-only domain engine; zero runtime dependencies beyond `zod`. |
| `apps/api` | `@copa/api` | Express 4 REST API deployed to Cloud Run. |
| `apps/web` | `@copa/web` | Next.js 15 / React 19 web app deployed to Cloud Run. |

The workspace list is declared in the root [`package.json`](../package.json):

```json
"workspaces": [
  "packages/core",
  "apps/api",
  "apps/web"
]
```

Everything below is enforced through the root `verify` script, which is the single gate a
change must pass:

```json
"verify": "npm run type-check && npm run lint && npm run test && npm run build"
```

For how these standards fit the larger system, see [System Architecture](./01-architecture.md);
for how they are proven at runtime, see [Testing Strategy](./05-testing.md).

---

## 1. Determinism as a design constraint

The domain core is deterministic by rule, not by convention. It contains no wall-clock
reads and no ambient randomness. Two inputs decide every output:

- **Time** — the match-relative minute, passed explicitly as a parameter.
- **Seed** — an integer seed passed explicitly to any function that would otherwise
  need randomness.

The core therefore never calls `Date.now()` and never calls `Math.random()`. Seeded
randomness comes from `prng.ts` (a seeded deterministic PRNG); match time comes from the
`minute` argument. Because both are parameters, every number the UI shows is reproducible
in a unit test given the same `(venueId, scenario, minute, seed)` tuple.

This constraint is visible directly in the request contracts. In
[`packages/core/src/schemas.ts`](../packages/core/src/schemas.ts), the match minute is a
first-class, bounded field rather than something derived from the current time:

```ts
/** Match-relative minute: gates open at -240 at the earliest; egress ends by +240. */
export const minuteSchema = z.number().int().min(-240).max(240);
```

The seed is supplied by configuration (`config.simSeed`) and threaded through every tool
call. In [`apps/api/src/services/assistant.ts`](../apps/api/src/services/assistant.ts) the
seed enters the tool context once and every handler reads it from there:

```ts
const ctx: ToolContext = {
  venueId: query.venueId,
  scenario: query.scenario,
  minute: query.minute,
  seed: config.simSeed,
  persona: query.persona,
  message,
};
```

Determinism has three concrete payoffs:

1. **Testability.** Because outputs are pure functions of their inputs, assertions can
   pin exact values rather than tolerate ranges.
2. **DEMO/LIVE agreement.** The demo path composes replies directly from engine output;
   the live path grounds Gemini in the *same* engine output. Both paths agree on the
   numbers because the numbers come from the same deterministic functions, not from the
   model. See [AI Assistant & Grounding Design](./03-ai-assistant.md).
3. **Reproducible incidents.** A scenario that reproduces the real 2026 tournament
   conditions the product was built to address (egress collapse, ingress backups,
   lightning suspensions, heat protocols) can be replayed exactly. See
   [Domain Model & Determinism](./11-domain-model.md).

---

## 2. A single schema source

There is exactly one authoritative source for the shape of every request the system
accepts: [`packages/core/src/schemas.ts`](../packages/core/src/schemas.ts). It is a
`zod`-only module owned by the domain core, and both the API and the web app import from
it. The header states the rule plainly:

> Web NEVER hand-mirrors these bounds — it imports them.

### 2.1 Schemas define bounds; types are inferred, never hand-written

Every request schema is declared once and its TypeScript type is *inferred* from it with
`z.infer`. Consumers use the inferred type; they never re-declare the shape. For example:

```ts
export const assistantQuerySchema = z
  .object({
    message: z.string().trim().min(1).max(ASSISTANT_INPUT_MAX_CHARS, { message: 'Message is too long.' }),
    venueId: venueIdSchema,
    persona: z.enum(['fan', 'volunteer', 'organizer', 'staff']).default('fan'),
    language: z.string().trim().max(20).optional(),
    literacyTier: z.enum(['standard', 'easy', 'audioFirst']).default('standard'),
    scenario: scenarioSchema.default('normal'),
    minute: minuteSchema.default(30),
  })
  .strict();

export type AssistantQuery = z.infer<typeof assistantQuerySchema>;
```

The eleven request schemas each export a matching inferred type — `CrowdQuery`,
`RoutingRequest`, `EgressRequest`, `WeatherQuery`, `IncidentReport`, `EntryFactsInput`,
`AssistantQuery`, `BriefingRequest`, `BootstrapRequest`, `MissionClaimInput`, and
`LeaderboardQuery`. Because the type is derived from the validator, the two can never
drift: a change to a bound changes the type in the same edit.

The same discipline covers the *response* direction on the web side. The browser does not
trust the API blindly; [`apps/web/lib/contracts.ts`](../apps/web/lib/contracts.ts) declares
`zod` schemas for the response shapes and derives the page-facing types from them. The
file's own comment explains why this matters:

> Pages consume THESE instead of hand-mirroring the shapes (hand-mirroring silently
> widens the enum fields — engine, zoneStatus, risk — back to bare `string`).

So `AssistantResponse`, `CrowdResponse`, `RouteResponse`, `WeatherResponse` and the rest
are `z.infer` outputs, and the client fails loudly on schema drift instead of casting.

### 2.2 The boundary is strict and the errors are safe

Two invariants are baked into the schema module:

- **`.strict()` everywhere.** Every request object is declared `.strict()`, so unknown
  keys are rejected rather than silently ignored. The exported map `ALL_REQUEST_SCHEMAS`
  exists specifically so an invariant test can assert "all strict + all safe" across every
  schema at once.
- **A shared, safe error map.** `safeErrorMap` is a custom `z.ZodErrorMap` that reports
  *which* field failed and *why-category*, but never the offending value:

  ```ts
  export const safeErrorMap: z.ZodErrorMap = (issue, ctx) => {
    const path = issue.path.join('.') || 'request';
    switch (issue.code) {
      case z.ZodIssueCode.invalid_enum_value:
        return { message: `Field "${path}" is not one of the allowed values.` };
      case z.ZodIssueCode.unrecognized_keys:
        return { message: 'The request contains fields that are not allowed.' };
      // ...
    }
  };
  ```

  This is the "no raw input echo" rule expressed as code. Display fields are additionally
  bounded and markup-free via the `displayText` helper (`regex(/^[^<>]*$/)`), a
  defence-in-depth measure against stored XSS.

These controls are part of the wider threat model documented in [Security](./06-security.md)
(zod `.strict()` addresses tampering; `safeErrorMap` addresses input-echo information
disclosure).

### 2.3 One documented tuple assertion, and only one

`zod`'s `enum()` needs a non-empty tuple literal, but the domain's option lists are
`readonly` const arrays owned by the domain modules (`VENUE_IDS`, `SCENARIOS`,
`ACCESSIBILITY_PROFILES`, and so on). Rather than sprinkle `as` casts across the schema
file, the module concentrates the one unavoidable assertion into a single, documented
helper:

```ts
function enumFromConst<T extends string>(values: readonly T[]): z.ZodEnum<[T, ...T[]]> {
  return z.enum(values as [T, ...T[]]);
}
```

Its docstring records exactly why it exists: it performs "the one, documented tuple
assertion so every schema infers LITERAL union types — which is what keeps the API layer
free of `as` casts end to end." The typing-discipline benefit (Section 4) is bought with a
single, auditable exception instead of many scattered ones.

---

## 3. Data-driven dispatch

Where a naive implementation would grow a long `switch` statement, Copa Copilot uses a
lookup table of named handler functions. The assistant's tool dispatch is the reference
example. In [`apps/api/src/services/assistant.ts`](../apps/api/src/services/assistant.ts),
each verb the assistant can perform is a small, named, individually-testable function with
one signature:

```ts
type ToolHandler = (ctx: ToolContext) => Result<ToolTrace, AppError>;

function handleCrowdStatus(ctx: ToolContext): Result<ToolTrace, AppError> { /* ... */ }
function handleSafeRoute(ctx: ToolContext): Result<ToolTrace, AppError> { /* ... */ }
function handleExitAdvice(ctx: ToolContext): Result<ToolTrace, AppError> { /* ... */ }
function handleWeatherProtocol(ctx: ToolContext): Result<ToolTrace, AppError> { /* ... */ }
function handleEntryChecklist(ctx: ToolContext): Result<ToolTrace, AppError> { /* ... */ }
function handleSustainability(ctx: ToolContext): Result<ToolTrace, AppError> { /* ... */ }
function handleRefuse(): Result<ToolTrace, AppError> { /* ... */ }
```

They are wired into a single map keyed by the `ToolId` union, and the executor is a
one-line table lookup with no branching:

```ts
/** Data-driven tool dispatch — one named handler per verb, no branching in the caller. */
const TOOL_HANDLERS: Record<ToolId, ToolHandler> = {
  getCrowdStatus: handleCrowdStatus,
  findSafeRoute: handleSafeRoute,
  getExitAdvice: handleExitAdvice,
  getWeatherProtocol: handleWeatherProtocol,
  getEntryChecklist: handleEntryChecklist,
  getSustainability: handleSustainability,
  refuse: handleRefuse,
};

export function executeTool(tool: ToolId, ctx: ToolContext): Result<ToolTrace, AppError> {
  return TOOL_HANDLERS[tool](ctx);
}
```

Because the map is typed `Record<ToolId, ToolHandler>`, adding a new tool to the `ToolId`
union is a compile error until a handler is supplied — the table is exhaustive by
construction. The same constants-as-data pattern recurs for `INTENT_KEYWORDS`,
`PERSONA_OPENER`, `REFUSAL_COPY`, and `STATUS_COLOR` in the UI kit: behaviour that varies
by a key is expressed as a keyed record, not as control flow. The advantages are the usual
ones — each branch is independently unit-testable, the caller stays trivial, and coverage
maps cleanly onto named functions.

---

## 4. Typing discipline

### 4.1 Strict TypeScript, no exceptions

The project compiles under `strict` mode with `noUncheckedIndexedAccess` enabled. Index
access is therefore treated as possibly-`undefined`, which forces the code to handle
missing elements explicitly — visible in handlers such as `handleCrowdStatus`, which reads
`busiest?.densityPct ?? 0` rather than assuming the sorted array is non-empty. The Node
engine floor is `>=20`.

### 4.2 The `Result<T, AppError>` channel

Core functions do not throw across module boundaries. Failure travels as a value through
the `Result<T, E>` type defined in
[`packages/core/src/result.ts`](../packages/core/src/result.ts):

```ts
export interface Ok<T> { readonly ok: true; readonly value: T; }
export interface Err<E> { readonly ok: false; readonly error: E; }
export type Result<T, E> = Ok<T> | Err<E>;
```

The module ships the small combinator set needed to work with it — `ok`, `err`, `map`,
`andThen`, and `unwrapOr` — each with a JSDoc `@example`. In practice the error type is
the domain's `AppError` taxonomy (`errors.ts`), so the standard channel across the core is
`Result<T, AppError>`. The header states the reason:

> core functions never throw across module boundaries; failures travel as values so the
> API layer can map them onto one safe HTTP envelope.

Consumers must discriminate on `.ok` before touching a value, which the compiler enforces.
Handlers return errors as data — `return err(appError('NOT_FOUND', ...))` — and callers
propagate them by returning the `Err` unchanged (`if (!route.ok) return route;`). The API
maps the resulting `AppError` codes onto a single HTTP error envelope; the code catalogue
(`VALIDATION_FAILED` 400, `NOT_FOUND` 404, `RATE_LIMITED` 429, `PAYLOAD_TOO_LARGE` 413,
`UPSTREAM_FAILURE` 502, `ASSISTANT_UNAVAILABLE` 503, `ROUTE_UNAVAILABLE` 409,
`MISSION_REJECTED` 422, `INTERNAL` 500) is documented in the
[API Reference](./10-api-reference.md).

### 4.3 No `as`-casts, end to end

The typing goal is that unsafe assertions do not appear in application source at all.
Literal union types flow from the single schema source (Section 2.3) through inference, so
the API layer never has to cast a validated value back into a narrower type, and the web
layer never has to widen or re-narrow an API response. The one deliberate, documented
exception is `enumFromConst`; everything downstream of it is cast-free by design. The
grep-census (Section 6) and the ESLint `no-explicit-any` rule keep this property from
silently eroding.

---

## 5. One styling system

The web app has a single styling system: **Tailwind CSS 4** for utilities, plus a shared
UI kit that owns every recurring surface. All shared primitives live in one file,
[`apps/web/components/ui.tsx`](../apps/web/components/ui.tsx), whose header states the
intent: "One place for the glass card, buttons, stat tiles, density meters, skeletons and
status pills so no scaffolding is copy-pasted."

The exported kit is:

| Component | Purpose |
|-----------|---------|
| `GlassCard` | The frosted glass surface primitive; `as="section"` for landmark regions only. |
| `Button` | Always a real `<button>`; `primary` / `ghost` / `gradient` variants; 44px minimum target. |
| `Panel` | A labelled `<section aria-labelledby>` region wrapping glass + padding + heading. |
| `Stack` | Consistent vertical spacing; replaces ad-hoc grid/gap inline styles. |
| `Muted` | The single home for the `--text-dim` secondary-text treatment. |
| `StatTile` | A labelled statistic tile with a large number. |
| `StatusPill` | A status pill that always carries an accessible text label — colour is never the only signal. |
| `DensityMeter` | `role="meter"` with correct `aria-valuenow` / `min` / `max` and a descriptive `aria-label`. |
| `Skeleton` | An `aria-hidden` loading placeholder. |
| `RetryCard` | An error card with a `role="alert"` live region and a retry button. |
| `SectionTitle` | A consistent `<h2>` heading with an anchor id. |

### 5.1 A single canonical surface class

Every surface renders through the same canonical CSS class, `glass-card`, applied by
`GlassCard`, `StatTile`, `Skeleton`, `RetryCard`, and `Panel`. Colour, spacing, and status
values are driven by CSS custom properties (`--primary`, `--on-primary`, `--text`,
`--text-dim`, `--surface-edge`, `--ok`, `--busy`, `--danger`) rather than hard-coded hex
values, so light and dark themes and contrast requirements are handled in one place. The
`STATUS_COLOR` record maps semantic status strings to those tokens, keeping colour
decisions data-driven and consistent between the pill and the meter.

Two properties fall out of routing all surfaces through the kit:

- **Consistency.** There is one glass look, one button geometry, and one muted-text
  treatment; pages compose primitives instead of re-styling from scratch.
- **Accessibility by construction.** Because interactive primitives are real focusable
  controls with correct roles and labels, accessibility is a property of the kit rather
  than something each page re-implements. Meters expose `role="meter"`; status is always
  conveyed as text as well as colour; touch targets meet the 44px minimum. The conformance
  details are covered in [Accessibility](./07-accessibility.md).

---

## 6. Automated hygiene gates

Consistency is enforced by tooling, not trust. Two independent gates run in CI and in the
local `verify` script.

### 6.1 ESLint flat config across all workspaces

A single flat config, [`eslint.config.mjs`](../eslint.config.mjs), covers every workspace
— core, api, web, e2e, and scripts. The root script is simply `"lint": "eslint ."`. The
config's header records the philosophy: "House rules are errors, not warnings — the repo
stays grep-clean by construction." It builds on `@eslint/js` recommended and
`typescript-eslint` recommended, then adds house rules as **errors**:

| Rule | Setting | Effect |
|------|---------|--------|
| `@typescript-eslint/no-explicit-any` | `error` | The `any` type is forbidden — including in test files. |
| `@typescript-eslint/no-non-null-assertion` | `error` | The `!` non-null assertion is forbidden. |
| `@typescript-eslint/consistent-type-imports` | `error` (inline) | Type-only imports must use inline `type` syntax. |
| `@typescript-eslint/no-unused-vars` | `error` | Unused variables fail; `^_`-prefixed names are exempt. |
| `no-console` | `error` | No console output in source (or the web app). |
| `prefer-const` | `error` | Rebinding what is never reassigned fails. |
| `eqeqeq` | `error` (`always`) | Strict equality only. |

Build artefacts and generated trees are ignored (`node_modules`, `dist`, `.next`,
`coverage`, `playwright-report`, `test-results`, `docs`, `infra`, `next-env.d.ts`).

### 6.2 The grep-census

The second gate is a source-tree census,
[`scripts/grep-census.ps1`](../scripts/grep-census.ps1). It asserts the source is clean of
a fixed list of anti-patterns and exits non-zero — failing CI and `verify` — if any count
is above zero. It scans **source only**, excluding test files (which legitimately use some
of these), across five roots:

```
packages/core/src
apps/api/src
apps/web/app
apps/web/components
apps/web/lib
```

The five census categories and their exact patterns are:

| Category | Pattern | What it forbids |
|----------|---------|-----------------|
| `explicit-any` | `:\s*any\b` | The `any` type annotation. |
| `console-usage` | `console\.(log\|error\|warn\|info\|debug)\s*\(` | Any `console` call. |
| `todo-fixme` | `TODO\|FIXME\|XXX` | Unfinished-work markers left in source. |
| `eslint-disable` | `eslint-disable` | Suppressing the linter inline. |
| `ts-suppress` | `@ts-(ignore\|nocheck\|expect-error)` | Suppressing the type-checker inline. |

The census reports a per-category count and a pass/fail line:

```
grep census clean: 0 anti-pattern hits in source
```

The `explicit-any` and `console-usage` categories overlap with ESLint rules on purpose:
the census is a defence-in-depth check that also catches the *evasions* an ESLint rule
cannot, because forbidding `eslint-disable` and `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`
outright means a rule cannot be silenced to smuggle a violation past the linter. Together
the two gates guarantee that the properties claimed in Sections 4 and 5 — no `any`, no
casts of the suppressing kind, no stray logging, no half-finished markers — hold across
the whole source tree, not just in spot checks.

### 6.3 Formatting

Prettier (`^3.4.0`) owns formatting, wired through `format` (`prettier --write .`) and
`format:check` (`prettier --check .`). Formatting is therefore not a matter of taste or
review comments; it is a machine decision.

---

## 7. The 19-module core map

The entire domain lives in `@copa/core` as nineteen focused modules under
`packages/core/src`. The package has zero runtime dependencies beyond `zod ^3.24`, which
is what makes it portable, fast to test, and free of framework coupling. The modules are:

| Module | Responsibility |
|--------|----------------|
| `prng.ts` | Seeded deterministic PRNG (no `Math.random`). |
| `result.ts` | `Result<T, AppError>` channel. |
| `errors.ts` | `AppError` taxonomy + safe localized messages. |
| `i18n.ts` | 6-language BCP-47 locale resolution. |
| `venues.ts` | 16-venue registry. |
| `stadium-graph.ts` | Per-venue stadium graphs. |
| `crowd.ts` | Seeded crowd/queue/transit simulation. |
| `routing.ts` | Crowd- and accessibility-aware safest route (linear-scan Dijkstra). |
| `egress.ts` | Exit-wave advisor (anti-MetLife). |
| `weather.ts` | 8-mile lightning + heat-tier protocol state machine. |
| `incidents.ts` | Incident triage / ordering. |
| `entry.ts` | Entry-readiness / anti-ghost-ticket. |
| `sustainability.ts` | Emission / CO2e math. |
| `gamification.ts` | Missions + point-math source (`clampRestoredPoints`). |
| `leaderboard.ts` | Leaderboard ordering. |
| `schemas.ts` | One shared `zod` schema source (`safeErrorMap`). |
| `index.ts` | Package barrel. |
| `a11y/wcag-catalog.ts` | Evidence-as-code WCAG catalogue (14 criteria). |
| `google/service-catalog.ts` | Evidence-as-code Google service catalogue (15 services). |

Each module has a single responsibility and is reached through the `index.ts` barrel, so
the API and web layers import from `@copa/core` rather than from deep paths. The domain
model these modules implement is detailed in
[Domain Model & Determinism](./11-domain-model.md); their test coverage — `@copa/core` at
99.4% statements against a `>=95` line/statement/function threshold — is detailed in
[Testing Strategy](./05-testing.md).

---

## 8. JSDoc on public contracts

Every exported contract carries a JSDoc comment stating what it is and, where relevant,
why it exists. This is visible throughout the files that define the public surface:

- In `result.ts`, each combinator documents its behaviour with a runnable `@example`
  (`map(ok(2), (n) => n * 2); // ok(4)`).
- In `schemas.ts`, every schema and every inferred type has a one-line docstring, and the
  non-obvious pieces carry a rationale — `enumFromConst` explains the single tuple
  assertion, `ASSISTANT_INPUT_MAX_CHARS` notes it is "also an efficiency control on Gemini
  spend," and `minuteSchema` documents its `-240`/`+240` bounds.
- In `assistant.ts`, the tool ids, the `ToolTrace`/`AssistantReply` interfaces, and the
  dispatch map are all documented, including the `engine` field's meaning
  (`'demo'` = deterministic engine composition; `'gemini'` = live model, engine-grounded).
- In `ui.tsx`, every exported component documents its intended use and its accessibility
  contract (for example, `GlassCard`'s note to use `as="section"` for primary landmark
  regions only, and `DensityMeter`'s `role="meter"` contract).

The standard is that a new engineer, or an auditor, can understand a public contract from
its signature and its docstring without reading the implementation. Comments explain
*intent and boundaries*, not mechanics the code already makes obvious.

---

## 9. How the standards compose

The individual rules reinforce one another rather than standing alone:

- **Determinism** makes the domain unit-testable, which is what lets coverage thresholds
  be meaningful.
- **The single schema source** produces literal union types, which is what makes the
  **no-`as`-cast** typing discipline achievable end to end.
- **Data-driven dispatch** keeps handlers small and named, which is what makes exhaustive
  typing and clean coverage possible.
- **The `Result` channel** keeps failures as typed values, which is what lets the API
  collapse them onto one safe error envelope without leaking internals.
- **One styling system** keeps accessibility a property of shared primitives instead of a
  per-page concern.
- **The ESLint config and the grep-census** are the ratchet that prevents any of the above
  from silently regressing.

A change is only complete when `npm run verify` passes: types check under `strict`, ESLint
reports zero errors, the grep-census reports zero hits, every test layer passes, and all
three workspaces build. That single command is the operational definition of "meets the
standard." For what the test layers prove, continue to [Testing Strategy](./05-testing.md);
for the deployment pipeline that runs these gates in CI, see
[Deployment & Operations](./09-deployment.md).
