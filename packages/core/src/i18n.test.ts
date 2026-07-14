// i18n.test.ts — M17: BCP-47 resolution priority (regional tags never mis-match).
import { describe, expect, it } from 'vitest';
import {
  LITERACY_TIERS,
  SUPPORTED_LANGUAGES,
  languageInfo,
  resolveLanguage,
} from './i18n';

describe('resolveLanguage (M17)', () => {
  it.each([
    // [input tag, expected resolution]
    ['en', 'en'],
    ['EN', 'en'],
    ['es', 'es'],
    ['fr', 'fr'],
    ['ar', 'ar'],
    ['hi', 'hi'],
    ['pt', 'pt'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['es-MX', 'es'],
    ['es-419', 'es'],
    ['fr-CA', 'fr'],
    ['ar-SA', 'ar'],
    ['hi-IN', 'hi'], // the documented regression class: regional tag → correct base
    ['pt-BR', 'pt'],
    ['ur-IN', 'en'], // unsupported language: default, never a wrong preset
    ['de-DE', 'en'],
    ['zz', 'en'],
  ] as const)('resolves %s → %s', (tag, expected) => {
    expect(resolveLanguage(tag)).toBe(expected);
  });

  it('defaults for empty and undefined input', () => {
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage('')).toBe('en');
    expect(resolveLanguage('   ')).toBe('en');
  });
});

describe('language registry', () => {
  it('covers exactly the six tournament languages', () => {
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(['en', 'es', 'fr', 'ar', 'hi', 'pt']);
  });

  it('marks Arabic as the only RTL language', () => {
    const rtl = SUPPORTED_LANGUAGES.filter((l) => l.dir === 'rtl');
    expect(rtl.map((l) => l.code)).toEqual(['ar']);
  });

  it.each(SUPPORTED_LANGUAGES.map((l) => l.code))('languageInfo(%s) round-trips', (code) => {
    expect(languageInfo(code).code).toBe(code);
    expect(languageInfo(code).nativeName.length).toBeGreaterThan(0);
  });
});

describe('literacy tiers', () => {
  it('tightens monotonically: standard > easy > audioFirst', () => {
    expect(LITERACY_TIERS.standard.maxWordsPerSentence).toBeGreaterThan(
      LITERACY_TIERS.easy.maxWordsPerSentence,
    );
    expect(LITERACY_TIERS.easy.maxWordsPerSentence).toBeGreaterThan(
      LITERACY_TIERS.audioFirst.maxWordsPerSentence,
    );
  });

  it('audio-first caps sentences at 12 words (assistant contract)', () => {
    expect(LITERACY_TIERS.audioFirst.maxWordsPerSentence).toBe(12);
  });
});
