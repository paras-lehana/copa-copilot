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

## Inclusive features beyond compliance
- Accessibility profiles (wheelchair / low-vision / sensory-sensitive) reshape routing **and** assistant behaviour.
- Wheelchair routes traverse step-free edges only — never stairs (enforced in the engine, asserted in tests).
- Every route is offered as a screen-reader text list, never only as a map.
- Audio-first mode caps assistant sentences at ≤12 words and reads them via browser TTS, honestly labelling which engine is speaking.
- Six languages including RTL Arabic.

## Honest gaps
Automated axe is comprehensive but not a substitute for manual AT testing; NVDA/VoiceOver passes are recommended pre-production. Google Cloud Text-to-Speech is `ready-with-key`; the demo uses the browser speech engine and says so.
