// i18n.ts — language registry and BCP-47 locale resolution.
// Boundary: this is the single source of supported languages, text direction and
// literacy tiers. Resolution is priority-ordered (exact tag → base subtag → default)
// so regional tags like `hi-IN` can never fall through to the wrong preset.

/** Languages the assistant and UI speak. */
export type LanguageCode = 'en' | 'es' | 'fr' | 'ar' | 'hi' | 'pt';

/** Metadata for one supported language. */
export interface LanguageInfo {
  readonly code: LanguageCode;
  /** Native display name shown in the language switcher. */
  readonly nativeName: string;
  /** Text direction — drives `dir` on the HTML root. */
  readonly dir: 'ltr' | 'rtl';
  /** Whether browser speechSynthesis voices are commonly available (honest flag). */
  readonly browserTtsCommon: boolean;
}

/** The full registry, constants-as-data. Order = switcher display order. */
export const SUPPORTED_LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', nativeName: 'English', dir: 'ltr', browserTtsCommon: true },
  { code: 'es', nativeName: 'Español', dir: 'ltr', browserTtsCommon: true },
  { code: 'fr', nativeName: 'Français', dir: 'ltr', browserTtsCommon: true },
  { code: 'ar', nativeName: 'العربية', dir: 'rtl', browserTtsCommon: false },
  { code: 'hi', nativeName: 'हिन्दी', dir: 'ltr', browserTtsCommon: false },
  { code: 'pt', nativeName: 'Português', dir: 'ltr', browserTtsCommon: true },
];

/** Literacy tiers controlling assistant sentence budgets (tested in prompt specs). */
export const LITERACY_TIERS = {
  standard: { maxWordsPerSentence: 28 },
  easy: { maxWordsPerSentence: 18 },
  audioFirst: { maxWordsPerSentence: 12 },
} as const;

/** A literacy tier name. */
export type LiteracyTier = keyof typeof LITERACY_TIERS;

const CODES: readonly LanguageCode[] = SUPPORTED_LANGUAGES.map((l) => l.code);

/**
 * Resolve a BCP-47 tag to a supported language, priority-ordered:
 * 1) exact case-insensitive code match ("es" → es)
 * 2) base subtag match ("hi-IN" → hi, "pt-BR" → pt)
 * 3) fallback to English.
 *
 * The regression this guards against: a regional tag matching an earlier, wrong
 * preset via substring logic (the documented `hi-IN`/`ur-IN` bug class).
 *
 * @example
 * resolveLanguage('pt-BR'); // 'pt'
 * resolveLanguage('ur-IN'); // 'en' (unsupported → default, never a wrong match)
 */
export function resolveLanguage(tag: string | undefined): LanguageCode {
  if (tag === undefined || tag.trim() === '') return 'en';
  const lower = tag.trim().toLowerCase();
  const exact = CODES.find((c) => c === lower);
  if (exact !== undefined) return exact;
  const base = lower.split('-')[0];
  const baseMatch = CODES.find((c) => c === base);
  return baseMatch ?? 'en';
}

/**
 * Language metadata lookup.
 *
 * @example
 * languageInfo('ar').dir; // 'rtl'
 */
export function languageInfo(code: LanguageCode): LanguageInfo {
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  // The registry covers every LanguageCode by construction; this satisfies
  // noUncheckedIndexedAccess without a non-null assertion.
  return found ?? SUPPORTED_LANGUAGES[0] ?? { code: 'en', nativeName: 'English', dir: 'ltr', browserTtsCommon: true };
}
