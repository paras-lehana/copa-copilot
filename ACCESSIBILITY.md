# Accessibility

Target: **WCAG 2.1 AA**. Verified by `@axe-core/playwright` on **all 10 routes in both light and dark themes** (`e2e/a11y.spec.ts` — 20 scans, zero violations). The dark-theme pass is deliberate: contrast regressions commonly hide there.

## Decisions & where they live
| Practice | Implementation |
|---|---|
| One `<h1>` per page; section cards are `<section aria-labelledby>` with `<h2>`; minor cards are `<div>` | every `app/**/page.tsx` |
| Skip link to `#main-content` (id matches this doc) | `components/Chrome.tsx`, `app/globals.css` |
| Theme-aware `--on-primary` token (white on primary fails AA in dark → flips to near-black) | `app/globals.css` |
| Light-theme status colours darkened so white text passes AA (≥4.5:1) | `app/globals.css` |
| Density bars are `role="meter"` with exact `aria-valuenow` (0–100) | `components/ui.tsx` `DensityMeter` |
| Every interactive element is a real control with a visible `:focus-visible` ring | `components/ui.tsx`, `globals.css` |
| Labelled inputs; `autocomplete` where relevant; selects have accessible names | onboarding, Chrome |
| Lists use `role="list"` (survives `list-style:none` in Safari/VoiceOver) | list surfaces |
| Errors in `role="alert"`; async status in `role="status"`; chat in `role="log"` + `aria-live` | assistant, dashboard, volunteer |
| Async-disabled controls set `aria-disabled` (focus not dropped) | dashboard, onboarding, missions |
| RTL: `dir` + `lang` on `<html>` follow the chosen language (Arabic = rtl) | `components/Chrome.tsx` |
| `prefers-reduced-motion` honoured in CSS (and framer-motion where used) | `globals.css` |
| Touch targets ≥ 44px | `components/ui.tsx` buttons, nav |

## Contrast (computed, both themes)
- **Light:** text `#0f1a2b` on `#f4f7fb` ≈ 15:1; white on primary `#0f7d8c` ≈ 4.8:1; white on `--ok #0f6b3f` ≈ 6.2:1, `--busy #8a5200` ≈ 7:1, `--danger #a01b14` ≈ 6:1.
- **Dark:** text `#eef2f7` on `#0b1220` ≈ 15:1; near-black `--on-primary #08131a` on primary `#32b8c6` ≈ 12.8:1 (the fix — white was 2.0:1).

## User-controlled presentation (in-app — no OS change required)
People with disabilities often use a shared kiosk, a borrowed phone, or a stadium
device where they cannot change the operating-system settings. WCAG **1.4.4 (Resize
Text)**, **1.4.8 (Visual Presentation)** and **2.3.3 (Animation from Interactions)**
therefore require the *content itself* to offer these controls. Copa Copilot ships a
built-in **Accessibility settings panel** (on `/accessibility`) with four preferences:

| Preference | Options | What it does | WCAG |
|---|---|---|---|
| Contrast | Standard / High | Firmer borders (2px), stronger text/background separation | 1.4.8 |
| Text size | Default / Large (+12.5%) / Extra large (+25%) | Scales the root font; rem-based type reflows without clipping | 1.4.4 |
| Reading font | Default / Dyslexia-friendly | Rounder system face + wider letter/word spacing + taller line-height | 1.4.8, 1.4.12 |
| Motion | System / Reduce | Mirrors `prefers-reduced-motion` for users who can't set the OS flag | 2.3.3 |

**How it's built (mirrors the theme system):**
- `apps/web/lib/a11y-prefs.ts` — typed prefs, defensive read/coerce, apply, persist, and a **pre-paint bootstrap script** (`A11Y_BOOTSTRAP_SCRIPT`) inlined in `app/layout.tsx` so a high-contrast/large-text user never sees a flash of the default look.
- Preferences are stamped on `<html>` as `data-contrast` / `data-text` / `data-font` / `data-motion`; `app/globals.css` keys off those attributes.
- `apps/web/components/AccessibilitySettings.tsx` — the panel: each preference is a native radio group inside a labelled `<fieldset>`/`<legend>`, fully keyboard-operable, applied **live** (no save button) and persisted to `localStorage`.
- Self-contained: no web font is fetched (strict-CSP-safe); the dyslexia option uses widely-available system faces plus the spacing improvements that carry most of the readability benefit.

## WCAG conformance catalogue (evidence-as-code)
`packages/core/src/a11y/wcag-catalog.ts` lists each satisfied WCAG 2.2 success criterion
with its level and the **repo path or user-visible behaviour that proves it** — the same
"no undefended claims" pattern as the Google service catalogue. It is rendered on the
`/accessibility` page (with a computed scorecard) and guarded by honesty-invariant tests
(`wcag-catalog.test.ts`): every row must cite real evidence, and the scorecard is computed
from the catalogue, never hard-coded. 14 criteria across levels A, AA and AAA.

## Inclusive features beyond compliance
- Accessibility profiles (wheelchair / low-vision / sensory-sensitive) reshape routing **and** assistant behaviour.
- Wheelchair routes traverse step-free edges only — never stairs (enforced in the engine, asserted in tests).
- Every route is offered as a screen-reader text list, never only as a map.
- Audio-first mode caps assistant sentences at ≤12 words and reads them via browser TTS, honestly labelling which engine is speaking.
- Six languages including RTL Arabic.

## Honest gaps
Automated axe is comprehensive but not a substitute for manual AT testing; NVDA/VoiceOver passes are recommended pre-production. Google Cloud Text-to-Speech is `ready-with-key`; the demo uses the browser speech engine and says so.
