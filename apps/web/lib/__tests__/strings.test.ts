// strings.test.ts — M18: UI string catalog completeness across all six languages.
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGES } from '@copa/core';
import { catalog } from '../strings';

const KEYS = Object.keys(catalog('en')) as (keyof ReturnType<typeof catalog>)[];

describe('string catalog completeness (M18)', () => {
  it.each(SUPPORTED_LANGUAGES.map((l) => l.code))('%s provides every key non-empty', (code) => {
    const c = catalog(code);
    for (const key of KEYS) {
      expect(c[key], `${code}.${key}`).toBeTruthy();
      expect(typeof c[key]).toBe('string');
    }
  });

  it('non-English catalogs localize the nav (not just copy English)', () => {
    expect(catalog('es').nav_home).toBe('Inicio');
    expect(catalog('fr').nav_map).toBe('Carte');
    expect(catalog('pt').nav_missions).toBe('Missões');
  });

  it('falls back to English for an unknown code', () => {
    // @ts-expect-error deliberately passing an unsupported code
    expect(catalog('zz').appName).toBe('Copa Copilot');
  });
});
