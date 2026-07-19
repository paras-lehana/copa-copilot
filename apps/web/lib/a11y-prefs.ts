// a11y-prefs.ts — user-controlled accessibility preferences (WCAG 1.4.4/1.4.8/2.3.3).
//
// WHY this exists: OS-level settings (prefers-reduced-motion, prefers-contrast) are
// honoured elsewhere, but many people with disabilities cannot or do not change OS
// settings — a shared kiosk, a borrowed phone, a stadium device. Per WCAG 1.4.4
// (Resize Text) and 1.4.8 (Visual Presentation), the CONTENT itself must let a user
// scale text, raise contrast, pick a reading-friendly typeface, and stop motion.
//
// HOW it works (same no-flash pattern as theme.ts): a tiny inline script sets the
// `data-*` attributes on <html> BEFORE first paint; globals.css keys off those
// attributes; this module drives the runtime toggles and persistence. SSR-safe —
// nothing here reads storage during render.

/** Contrast preference. `high` boosts borders and text/background separation. */
export type ContrastPref = 'normal' | 'high';
/** Text-scale preference (WCAG 1.4.4 lets users reach 200% without loss). */
export type TextScalePref = 'normal' | 'large' | 'xlarge';
/** Typeface preference. `dyslexic` widens letter/word spacing and picks a rounder face. */
export type FontPref = 'default' | 'dyslexic';
/** Motion preference. `reduce` mirrors prefers-reduced-motion for users who can't set the OS flag. */
export type MotionPref = 'system' | 'reduce';

/** The complete, serialisable set of accessibility preferences. */
export interface A11yPrefs {
  contrast: ContrastPref;
  textScale: TextScalePref;
  font: FontPref;
  motion: MotionPref;
}

/** The safe, unopinionated defaults (defer to OS/browser where possible). */
export const DEFAULT_A11Y_PREFS: A11yPrefs = {
  contrast: 'normal',
  textScale: 'normal',
  font: 'default',
  motion: 'system',
};

const STORAGE_KEY = 'copa-a11y';

/** Map each preference to the `data-*` attribute globals.css reads. */
const ATTR = {
  contrast: 'data-contrast',
  textScale: 'data-text',
  font: 'data-font',
  motion: 'data-motion',
} as const;

/** Narrow an unknown blob into A11yPrefs, coercing anything invalid to the default. */
function coerce(raw: unknown): A11yPrefs {
  const o = (raw ?? {}) as Partial<Record<keyof A11yPrefs, unknown>>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  return {
    contrast: pick(o.contrast, ['normal', 'high'], 'normal'),
    textScale: pick(o.textScale, ['normal', 'large', 'xlarge'], 'normal'),
    font: pick(o.font, ['default', 'dyslexic'], 'default'),
    motion: pick(o.motion, ['system', 'reduce'], 'system'),
  };
}

/** Read persisted preferences (defensively — a corrupt blob resets to defaults). */
export function readA11yPrefs(): A11yPrefs {
  if (typeof window === 'undefined') return DEFAULT_A11Y_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? DEFAULT_A11Y_PREFS : coerce(JSON.parse(raw));
  } catch {
    return DEFAULT_A11Y_PREFS;
  }
}

/** Reflect preferences onto the document root as `data-*` attributes (no-op on the server). */
export function applyA11yPrefs(prefs: A11yPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // Only stamp a non-default value so the DOM stays clean and CSS selectors stay simple.
  const set = (attr: string, value: string, isDefault: boolean) =>
    isDefault ? root.removeAttribute(attr) : root.setAttribute(attr, value);
  set(ATTR.contrast, prefs.contrast, prefs.contrast === 'normal');
  set(ATTR.textScale, prefs.textScale, prefs.textScale === 'normal');
  set(ATTR.font, prefs.font, prefs.font === 'default');
  set(ATTR.motion, prefs.motion, prefs.motion === 'system');
}

/** Persist preferences (best-effort — a full/blocked store never breaks the session). */
export function writeA11yPrefs(prefs: A11yPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the in-memory preference still applies for this session.
  }
}

/**
 * The tiny script inlined in <head> to set the accessibility attributes before first
 * paint — so a high-contrast/large-text user never sees a flash of the default theme.
 * Kept dependency-free and wrapped in try/catch (private-mode storage throws).
 */
export const A11Y_BOOTSTRAP_SCRIPT = `try{var p=JSON.parse(localStorage.getItem('${STORAGE_KEY}')||'{}');var r=document.documentElement;if(p.contrast==='high')r.setAttribute('data-contrast','high');if(p.textScale==='large'||p.textScale==='xlarge')r.setAttribute('data-text',p.textScale);if(p.font==='dyslexic')r.setAttribute('data-font','dyslexic');if(p.motion==='reduce')r.setAttribute('data-motion','reduce');}catch(e){}`;
