# Accessibility — Copa Copilot

Accessibility in Copa Copilot is treated as an engineering contract rather than a
post-hoc audit. The web app targets a measurable conformance level, verifies it on
every route in an automated pipeline, ships user-controllable presentation that works
without any operating-system change, and encodes each WCAG success criterion as
evidence-as-code so that no accessibility claim is undefended. This document describes
the conformance target and how it is verified, the in-app accessibility settings panel,
the WCAG 2.2 conformance catalogue, the inclusive behaviour built into the stadium
engine, the contrast token system, and the six-language internationalization surface
(including right-to-left Arabic).

Accessibility touches several sibling areas: presentation tokens and the theme system
overlap with [Code Quality](./04-code-quality.md); the axe pipeline is one layer of the
[Testing Strategy](./05-testing.md); the self-contained, no-external-font posture is
consistent with the choices in [Security](./06-security.md); and the inclusive routing
behaviour is powered by the deterministic engine described in the
[Domain Model](./11-domain-model.md).

---

## 1. Conformance target and verification

### 1.1 Target

The stated conformance target is **WCAG 2.1 AA**. The evidence catalogue
(`packages/core/src/a11y/wcag-catalog.ts`) references **WCAG 2.2** success criteria,
because 2.2 is a superset of 2.1 and the criteria it catalogues span levels A, AA and
AAA. In other words, AA is the floor the product commits to, and several AAA criteria
are additionally met and documented where the code genuinely demonstrates them.

### 1.2 How it is verified

Conformance is verified continuously with `@axe-core/playwright` (`^4.10`) driven by
Playwright (`^1.49`). The end-to-end spec `e2e/a11y.spec.ts` runs axe against **all 10
scanned web routes in both the light and the dark theme** — **20 scans in total**, each
of which must report **zero violations**.

The web app has 11 routes overall (dashboard, onboarding, map, assistant, ops,
volunteer, missions, leaderboard, accessibility, google-services, plus supporting
surfaces); axe is scanned on 10 of them across the two themes. The dark-theme pass is a
deliberate design decision: contrast regressions most commonly hide in dark mode, where
a token that looks fine in light mode may silently drop below the 4.5:1 threshold.
Running the full matrix in both themes closes that gap.

Automated scanning is comprehensive but is not represented as a substitute for manual
assistive-technology testing. As stated in `ACCESSIBILITY.md`, NVDA and VoiceOver passes
are recommended before production. The catalogue and this document intentionally avoid
claiming manual-AT conformance that has not been performed.

---

## 2. In-app accessibility settings panel

People with disabilities frequently operate a device whose operating-system settings
they cannot change — a shared stadium kiosk, a borrowed phone, or a venue-issued device.
WCAG **1.4.4 (Resize Text)**, **1.4.8 (Visual Presentation)** and **2.3.3 (Animation
from Interactions)** therefore require the *content itself* to offer these controls, not
merely to honour OS preferences. Copa Copilot ships a built-in accessibility settings
panel on the `/accessibility` route that satisfies this requirement.

### 2.1 The four preferences

| Preference | Options | Effect | WCAG criteria |
|---|---|---|---|
| Contrast | Standard / High | Firmer borders (2px on cards) and a stronger text/background separation | 1.4.8 |
| Text size | Default / Large (+12.5%) / Extra large (+25%) | Scales the root font; rem-based type reflows without clipping | 1.4.4 |
| Reading font | Default / Dyslexia-friendly | Rounder system typeface with wider letter/word spacing and taller line-height | 1.4.8, 1.4.12 |
| Motion | Use my system setting / Reduce motion | Mirrors `prefers-reduced-motion` for users who cannot set the OS flag | 2.3.3 |

The percentages and labels are exact and come straight from the panel and stylesheet:
`data-text='large'` sets the root to `112.5%`, `data-text='xlarge'` to `125%`
(`apps/web/app/globals.css`).

### 2.2 How the panel is built

The implementation mirrors the theme system and is split across three files:

- **`apps/web/lib/a11y-prefs.ts`** — the typed preference model. It defines the
  `A11yPrefs` interface (`contrast`, `textScale`, `font`, `motion`), the
  `DEFAULT_A11Y_PREFS` (all values defer to the OS/browser where possible), and the
  functions that read, coerce, apply and persist preferences. `readA11yPrefs()` reads
  from `localStorage` under the key `copa-a11y` and defends against a corrupt blob by
  resetting to defaults; `coerce()` narrows any unknown input, coercing anything invalid
  back to a safe default; `applyA11yPrefs()` reflects the preferences onto the document
  root; and `writeA11yPrefs()` persists best-effort, so a full or blocked store never
  breaks the session.

- **`apps/web/components/AccessibilitySettings.tsx`** — the panel UI. Each preference is
  a native radio group rendered inside a labelled `<fieldset>` with a `<legend>`
  (`PrefGroup`). The panel is fully keyboard-operable, applies every change **live with
  no save button** (the `change()` handler calls `applyA11yPrefs` and `writeA11yPrefs`
  on each selection), and offers a **Reset to defaults** button. A `role="status"` region
  announces that changes apply instantly and are saved on this device.

- **`apps/web/app/globals.css`** — the presentation rules keyed off the `data-*`
  attributes. The stylesheet contains the `[data-text]`, `[data-contrast]`, `[data-font]`
  and `[data-motion]` blocks that translate a stamped attribute into a concrete visual
  change.

### 2.3 The pre-paint bootstrap (no flash)

Preferences are stamped on the `<html>` element as `data-contrast`, `data-text`,
`data-font` and `data-motion`. To avoid a flash of the default appearance before React
hydrates, `a11y-prefs.ts` exports `A11Y_BOOTSTRAP_SCRIPT` — a tiny, dependency-free
inline script that reads `localStorage` and sets those attributes **before first paint**.
It is inlined in the document `<head>` (via `app/layout.tsx`) and wrapped in a
`try/catch` because private-mode storage can throw. A high-contrast or large-text user
therefore never sees the default look flicker on load.

`applyA11yPrefs()` only stamps *non-default* values (it removes the attribute when a
preference is at its default), which keeps the DOM clean and the CSS selectors simple.

### 2.4 Self-contained by design

No web font is fetched. The dyslexia-friendly option uses widely-available system faces
(`'Comic Sans MS', 'Trebuchet MS', Verdana, system-ui, sans-serif`) plus the letter
spacing (`0.04em`), word spacing (`0.12em`) and line-height (`1.7`) that carry most of
the readability benefit. Avoiding an external font request keeps the feature
strict-CSP-safe and consistent with the product's no-external-dependency posture.

---

## 3. WCAG 2.2 conformance catalogue (evidence-as-code)

### 3.1 The pattern

`packages/core/src/a11y/wcag-catalog.ts` is the single source of truth for accessibility
conformance claims. It follows the same evidence-as-code discipline as the Google
service catalogue described in [Google Cloud & Gemini Integration](./08-google-cloud.md):
each entry names a WCAG 2.2 success criterion, its conformance level, a plain-language
description of *how* the app satisfies it, and the **repo path or user-observable
behaviour that proves the claim**. The guiding rule stated in the file header is "no
undefended claims" — every row is defensible by opening the cited file or performing the
cited action.

The `WcagCriterion` interface captures each row:

```ts
export interface WcagCriterion {
  readonly id: string;      // e.g. "1.4.4"
  readonly name: string;    // e.g. "Resize Text"
  readonly level: WcagLevel;   // 'A' | 'AA' | 'AAA'
  readonly status: WcagStatus; // 'supported' | 'partial'
  readonly how: string;        // how the app satisfies it
  readonly evidence: string;   // repo path / observable behaviour
}
```

The catalogue is consumed by the `/accessibility` page (which renders both the rows and
a computed scorecard) and by honesty-invariant tests in `wcag-catalog.test.ts`.

### 3.2 The catalogued criteria

The catalogue lists **14 criteria** across levels A, AA and AAA. Each row below reflects
the actual `how` and `evidence` fields in the source file.

| ID | Name | Level | How it is met | Evidence |
|---|---|---|---|---|
| 1.1.1 | Non-text Content | A | Icons are `aria-hidden`; the density map has an `aria-label` and a full text-list twin | `apps/web/app/map/page.tsx` — `<svg role="img">` plus the "Zones (text list)" panel |
| 1.3.1 | Info and Relationships | A | Landmarks, one `<h1>` per page, section headings with `aria-labelledby`, real `<fieldset>`/`<legend>` forms | `components/ui.tsx` Panel/SectionTitle; `components/AccessibilitySettings.tsx` fieldsets |
| 1.4.3 | Contrast (Minimum) | AA | Light and dark tokens both pass 4.5:1; the primary carries a theme-aware on-colour | `apps/web/app/globals.css` — `--on-primary` and darkened status tokens; axe tests in both themes |
| 1.4.4 | Resize Text | AA | A built-in text-size control scales the root font to +12.5% / +25% without breaking layout | `lib/a11y-prefs.ts` + `globals.css [data-text]` rules; controls on the Accessibility page |
| 1.4.8 | Visual Presentation | AAA | Users can raise contrast and choose a dyslexia-friendly typeface with wider letter/word spacing | `globals.css [data-contrast]` and `[data-font]` rules driven by AccessibilitySettings |
| 1.4.10 | Reflow | AA | Responsive grids and max-width media; no horizontal scroll of the page body at any width | Tailwind responsive utilities across pages; the Bento grid collapses to one column |
| 1.4.12 | Text Spacing | AA | The dyslexia-friendly font option increases letter and word spacing without clipping content | `globals.css :root[data-font="dyslexic"]` letter-spacing/word-spacing |
| 2.1.1 | Keyboard | A | Every control is a native focusable element; the assistant dialog traps and returns focus | `components/AssistantPanel.tsx` focus trap; all actions are `<button>`/`<a>`/`<input>` |
| 2.4.1 | Bypass Blocks | A | A skip link jumps straight to the main content region | `components/Chrome.tsx` skip-to-content link + `<main id>` |
| 2.4.7 | Focus Visible | AA | A visible focus ring is preserved (never removed) on all interactive elements | `apps/web/app/globals.css :focus-visible` outline rules |
| 2.3.3 | Animation from Interactions | AAA | Entrance animations no-op under `prefers-reduced-motion` or the in-app Reduce-motion toggle | `app/page.tsx makeFade(useReducedMotion())`; `globals.css [data-motion="reduce"]` |
| 3.1.2 | Language of Parts | AA | Six UI languages including right-to-left Arabic; the assistant replies in the chosen language | `packages/core/src/i18n.ts`; SpeechSynthesis `lang` follows the session language |
| 4.1.2 | Name, Role, Value | A | Status pills carry text (never colour alone); density bars are `role="meter"` with exact values | `components/ui.tsx` StatusPill/DensityMeter aria attributes |
| 4.1.3 | Status Messages | AA | Async results announce via `role="status"`/`role="alert"` live regions rather than silent updates | RetryCard `role="alert"`; exit-advice and settings `role="status"` regions |

The catalogue is deliberately scoped to what the code genuinely demonstrates. Every row
has status `supported` — that is, met with verifiable evidence. The `partial` status
exists in the type system (`WcagStatus`) for criteria that are only partially met, but no
row currently uses it.

### 3.3 The computed scorecard

The scorecard shown on the `/accessibility` page is **computed from the catalogue, never
hard-coded**. The pure function `wcagScorecard()` derives the totals directly:

```ts
export function wcagScorecard(
  criteria: readonly WcagCriterion[] = WCAG_CRITERIA,
): WcagScorecard {
  return {
    total: criteria.length,
    supported: criteria.filter((c) => c.status === 'supported').length,
    partial: criteria.filter((c) => c.status === 'partial').length,
    levelA: criteria.filter((c) => c.level === 'A').length,
    levelAA: criteria.filter((c) => c.level === 'AA').length,
    levelAAA: criteria.filter((c) => c.level === 'AAA').length,
  };
}
```

Because the function is pure (no `Date.now()`, no I/O), it is safe to run on either the
server or the client and it produces the same result every time. Deriving the scorecard
from the catalogue means the two can never drift: adding a criterion updates the counts
automatically.

### 3.4 Honesty-invariant tests

`wcag-catalog.test.ts` guards the catalogue against undefended or drifting claims. The
invariants it enforces are: every row must cite real evidence, and the scorecard must be
computed from the catalogue rather than asserted independently. This is the accessibility
equivalent of the grounded-faithfulness discipline the assistant is held to — the
documentation cannot claim a conformance the code does not back up.

---

## 4. Inclusive engine behaviour

Accessibility in Copa Copilot extends past the presentation layer into the deterministic
stadium engine (`@copa/core`). Accessibility profiles — wheelchair, low-vision, and
sensory-sensitive — reshape both routing and assistant behaviour.

### 4.1 Step-free wheelchair routing

The routing engine (`packages/core/src/routing.ts`) computes a crowd- and
accessibility-aware safest route across a per-venue stadium graph using a linear-scan
Dijkstra search. When the wheelchair profile is active, the route traverses **step-free
edges only and never routes over stairs**. This constraint is enforced in the engine
itself and asserted in the core unit tests, so a wheelchair route can never silently
include an inaccessible segment. Because the engine is deterministic (route inputs are
parameters, not wall-clock time or `Math.random()`), the same request always yields the
same accessible route, which makes the behaviour reproducible in a test.

### 4.2 Text-list twins for the map

Every route and every crowd-density view is offered as a screen-reader-friendly text
list, never only as a visual map. The `/map` route pairs its `<svg role="img">` density
map with a "Zones (text list)" panel (catalogued under 1.1.1). A screen-reader user
receives the same information as a sighted user through an equivalent, fully readable
structure rather than an inaccessible graphic.

### 4.3 ARIA meters with exact values

Crowd-density bars are not decorative. The `DensityMeter` component in
`components/ui.tsx` is a `role="meter"` with an exact `aria-valuenow` in the 0–100 range,
so assistive technology announces the precise density value rather than a vague
"medium/high". Status pills (`StatusPill`) always carry text and never convey state by
colour alone, which satisfies 4.1.2 (Name, Role, Value) and avoids colour-only meaning.

### 4.4 Keyboard, skip link, and focus ring

Every interactive element is a real, native control (`<button>`, `<a>`, `<input>`), so
the entire app is keyboard operable (2.1.1). The assistant dialog
(`components/AssistantPanel.tsx`) traps focus while open and returns it to the invoking
element on close. A skip link in `components/Chrome.tsx` jumps directly to the
`#main-content` region and satisfies 2.4.1 (Bypass Blocks); its styling in `globals.css`
keeps it off-screen (`left: -9999px`) until focused, at which point it slides into view.
A visible focus ring is applied globally and never removed — `:focus-visible` renders a
`3px` outline in the theme's `--focus` colour with a `2px` offset — satisfying 2.4.7.

Async-disabled controls set `aria-disabled` rather than the native `disabled` attribute,
so focus is not dropped while an action is in flight, and status changes announce through
`role="status"`, `role="alert"` and (for chat) `role="log"` with `aria-live`, satisfying
4.1.3. Touch targets are kept at 44px or larger on buttons and navigation.

### 4.5 Audio-first mode

An audio-first mode caps assistant sentences at 12 words or fewer and reads them aloud
through the browser's speech engine. The `SpeechSynthesis` `lang` follows the active
session language. Consistent with the product's honest-engine-labelling principle
(see [AI Assistant & Grounding Design](./03-ai-assistant.md)), the mode states which
engine is speaking. Google Cloud Text-to-Speech is a `ready-with-key` integration; the
demo uses the browser's built-in speech engine and says so rather than implying a
higher-fidelity service is in use.

---

## 5. Contrast tokens

### 5.1 Theme-aware on-primary

Contrast is handled through the design-token layer in `apps/web/app/globals.css`. The
notable engineering decision is a **theme-aware `--on-primary` token**. White text on the
teal primary passes AA in light mode but fails badly in dark mode, where the primary
lightens to `#32b8c6`. Rather than lower the primary or accept a failure, the on-colour
flips per theme:

- **Light:** `--primary #0f7d8c` with `--on-primary #ffffff` (white on primary ≈ 4.8:1).
- **Dark:** `--primary #32b8c6` with `--on-primary #08131a` (near-black on primary
  ≈ 12.8:1 — the fix; white would have been ≈ 2.0:1, a clear failure).

Status colours in light mode are deliberately darkened so that white text on them passes
AA (≥ 4.5:1):

| Token | Light value | White-on-token contrast |
|---|---|---|
| `--ok` | `#0f6b3f` | ≈ 6.2:1 |
| `--busy` | `#8a5200` | ≈ 7:1 |
| `--danger` | `#a01b14` | ≈ 6:1 |

Body text contrast is comfortably high in both themes: `#0f1a2b` on `#f4f7fb` ≈ 15:1 in
light, and `#eef2f7` on `#0b1220` ≈ 15:1 in dark. These figures are computed and are
re-verified by the axe pass, which runs in both themes precisely to catch any regression
in these tokens.

### 5.2 High-contrast override

When the user selects High contrast, the `[data-contrast='high']` rules firm the surface
edges (`--surface-edge` rises to a 0.55-alpha border), strengthen the dim-text colour,
give cards a `2px` border with no shadow, and set card and body backgrounds to the solid
`--bg-1`. The override is theme-aware: the dark-mode variant uses a light 0.55-alpha edge
and a bright dim-text colour so the effect reads correctly in both themes.

---

## 6. Internationalization

### 6.1 Six languages, including RTL Arabic

Locale resolution lives in `packages/core/src/i18n.ts`, which resolves six BCP-47 UI
languages:

| Language | Code | Direction |
|---|---|---|
| English | `en` | LTR |
| Spanish | `es` | LTR |
| French | `fr` | LTR |
| Arabic | `ar` | **RTL** |
| Hindi | `hi` | LTR |
| Portuguese | `pt` | LTR |

`components/Chrome.tsx` sets both the `dir` and `lang` attributes on the `<html>` element
to follow the chosen language — Arabic switches the document to `dir="rtl"`. Setting
`lang` per session also satisfies 3.1.2 (Language of Parts) and lets speech synthesis and
assistive technology pronounce content correctly. The assistant replies in the selected
language, and localisation is verified in the AI evaluation harness (see
[Testing Strategy](./05-testing.md) and the evals harness) at 100% localisation.

### 6.2 Consistency with the deterministic core

Because language resolution lives in the pure `@copa/core` engine, the same locale input
always resolves to the same language and direction, and localized error messages come
from the shared `errors.ts` taxonomy with safe, field-name-only content. Language is a
parameter, not ambient state — the same determinism principle that governs the rest of
the engine (see [Domain Model & Determinism](./11-domain-model.md)).

---

## 7. Honest gaps

The documentation is deliberate about what has *not* been done:

- **Automated axe is not manual AT.** The 20-scan axe matrix is thorough for programmatic
  checks, but NVDA and VoiceOver passes are recommended before production and have not
  been substituted for.
- **Text-to-Speech.** Google Cloud Text-to-Speech is a `ready-with-key` integration; the
  demo speaks through the browser engine and labels itself as such rather than implying a
  managed cloud voice.
- **Dyslexia support scope.** The dyslexia-friendly option relies on system faces plus
  spacing rather than a specialist web font, a conscious trade-off to remain
  self-contained and CSP-safe; it captures most of the readability benefit but is not a
  substitute for a purpose-built dyslexia typeface.

Stating these limits is part of the same no-undefended-claims discipline that governs the
conformance catalogue: the product documents the accessibility it can prove and is
explicit about the accessibility it cannot yet claim.

---

## Referenced files

| Concern | File |
|---|---|
| Evidence-as-code WCAG catalogue + scorecard | `packages/core/src/a11y/wcag-catalog.ts` |
| Honesty-invariant catalogue tests | `packages/core/src/a11y/wcag-catalog.test.ts` |
| Preference model, coercion, persistence, bootstrap | `apps/web/lib/a11y-prefs.ts` |
| In-app settings panel UI | `apps/web/components/AccessibilitySettings.tsx` |
| Tokens, contrast overrides, focus ring, skip link, `data-*` rules | `apps/web/app/globals.css` |
| Skip link + `dir`/`lang` handling | `apps/web/components/Chrome.tsx` |
| Density meter, status pills, panels | `apps/web/components/ui.tsx` |
| Accessibility-aware routing | `packages/core/src/routing.ts` |
| Locale resolution | `packages/core/src/i18n.ts` |
| axe conformance sweep | `e2e/a11y.spec.ts` |
| Narrative overview | `ACCESSIBILITY.md` |
