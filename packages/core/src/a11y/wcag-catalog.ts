// a11y/wcag-catalog.ts — evidence-as-code for accessibility, mirroring the Google
// service catalog pattern. Each entry names a WCAG 2.2 success criterion, its
// conformance level, HOW Copa Copilot satisfies it, and the repo path or user-visible
// behaviour that PROVES the claim. This is the single source consumed by the
// /accessibility page and by the conformance invariant tests — no undefended claims.

/** WCAG conformance levels (A is the floor; AA is the common legal target). */
export type WcagLevel = 'A' | 'AA' | 'AAA';

/** How fully the app meets a criterion. `supported` = met with verifiable evidence. */
export type WcagStatus = 'supported' | 'partial';

/** One WCAG success criterion and the evidence that Copa Copilot meets it. */
export interface WcagCriterion {
  /** WCAG number, e.g. "1.4.4". */
  readonly id: string;
  /** Official criterion name, e.g. "Resize Text". */
  readonly name: string;
  readonly level: WcagLevel;
  readonly status: WcagStatus;
  /** Plain-language description of how the app satisfies it. */
  readonly how: string;
  /** Repo path or user-observable behaviour that backs the claim. */
  readonly evidence: string;
}

/**
 * The catalogued criteria. Deliberately scoped to what the code genuinely demonstrates
 * — every row is defensible by opening the cited file or performing the cited action.
 */
export const WCAG_CRITERIA: readonly WcagCriterion[] = [
  {
    id: '1.1.1',
    name: 'Non-text Content',
    level: 'A',
    status: 'supported',
    how: 'Icons are aria-hidden; the density map has an aria-label and a full text-list twin.',
    evidence: 'apps/web/app/map/page.tsx — <svg role="img"> plus the "Zones (text list)" panel.',
  },
  {
    id: '1.3.1',
    name: 'Info and Relationships',
    level: 'A',
    status: 'supported',
    how: 'Landmarks, one <h1> per page, section headings with aria-labelledby, real <fieldset>/<legend> forms.',
    evidence: 'components/ui.tsx Panel/SectionTitle; components/AccessibilitySettings.tsx fieldsets.',
  },
  {
    id: '1.4.3',
    name: 'Contrast (Minimum)',
    level: 'AA',
    status: 'supported',
    how: 'Light and dark tokens both pass 4.5:1; the primary carries a theme-aware on-colour.',
    evidence: 'apps/web/app/globals.css — --on-primary and darkened status tokens; axe tests in both themes.',
  },
  {
    id: '1.4.4',
    name: 'Resize Text',
    level: 'AA',
    status: 'supported',
    how: 'A built-in text-size control scales the root font to +12.5% / +25% without breaking layout.',
    evidence: 'lib/a11y-prefs.ts + globals.css [data-text] rules; controls in the Accessibility page.',
  },
  {
    id: '1.4.8',
    name: 'Visual Presentation',
    level: 'AAA',
    status: 'supported',
    how: 'Users can raise contrast and choose a dyslexia-friendly typeface with wider letter/word spacing.',
    evidence: 'globals.css [data-contrast] and [data-font] rules driven by AccessibilitySettings.',
  },
  {
    id: '1.4.10',
    name: 'Reflow',
    level: 'AA',
    status: 'supported',
    how: 'Responsive grids and max-width media; no horizontal scroll of the page body at any width.',
    evidence: 'Tailwind responsive utilities across pages; the Bento grid collapses to one column.',
  },
  {
    id: '1.4.12',
    name: 'Text Spacing',
    level: 'AA',
    status: 'supported',
    how: 'The dyslexia-friendly font option increases letter and word spacing without clipping content.',
    evidence: 'globals.css :root[data-font="dyslexic"] letter-spacing/word-spacing.',
  },
  {
    id: '2.1.1',
    name: 'Keyboard',
    level: 'A',
    status: 'supported',
    how: 'Every control is a native focusable element; the assistant dialog traps and returns focus.',
    evidence: 'components/AssistantPanel.tsx focus trap; all actions are <button>/<a>/<input>.',
  },
  {
    id: '2.4.1',
    name: 'Bypass Blocks',
    level: 'A',
    status: 'supported',
    how: 'A skip link jumps straight to the main content region.',
    evidence: 'components/Chrome.tsx skip-to-content link + <main id>.',
  },
  {
    id: '2.4.7',
    name: 'Focus Visible',
    level: 'AA',
    status: 'supported',
    how: 'A visible focus ring is preserved (never removed) on all interactive elements.',
    evidence: 'apps/web/app/globals.css :focus-visible outline rules.',
  },
  {
    id: '2.3.3',
    name: 'Animation from Interactions',
    level: 'AAA',
    status: 'supported',
    how: 'Entrance animations no-op under prefers-reduced-motion or the in-app Reduce-motion toggle.',
    evidence: 'app/page.tsx makeFade(useReducedMotion()); globals.css [data-motion="reduce"].',
  },
  {
    id: '3.1.2',
    name: 'Language of Parts',
    level: 'AA',
    status: 'supported',
    how: 'Six UI languages including right-to-left Arabic; the assistant replies in the chosen language.',
    evidence: 'packages/core/src/i18n.ts; SpeechSynthesis lang follows the session language.',
  },
  {
    id: '4.1.2',
    name: 'Name, Role, Value',
    level: 'A',
    status: 'supported',
    how: 'Status pills carry text (never colour alone); density bars are role="meter" with exact values.',
    evidence: 'components/ui.tsx StatusPill/DensityMeter aria attributes.',
  },
  {
    id: '4.1.3',
    name: 'Status Messages',
    level: 'AA',
    status: 'supported',
    how: 'Async results announce via role="status"/role="alert" live regions rather than silent updates.',
    evidence: 'RetryCard role="alert"; exit-advice and settings role="status" regions.',
  },
];

/** Aggregate conformance counts for the accessibility scorecard. */
export interface WcagScorecard {
  readonly total: number;
  readonly supported: number;
  readonly partial: number;
  readonly levelA: number;
  readonly levelAA: number;
  readonly levelAAA: number;
}

/** Compute the scorecard from the catalog (pure — safe for server or client). */
export function wcagScorecard(criteria: readonly WcagCriterion[] = WCAG_CRITERIA): WcagScorecard {
  return {
    total: criteria.length,
    supported: criteria.filter((c) => c.status === 'supported').length,
    partial: criteria.filter((c) => c.status === 'partial').length,
    levelA: criteria.filter((c) => c.level === 'A').length,
    levelAA: criteria.filter((c) => c.level === 'AA').length,
    levelAAA: criteria.filter((c) => c.level === 'AAA').length,
  };
}
