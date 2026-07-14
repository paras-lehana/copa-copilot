'use client';

// Chrome.tsx — the app shell: skip link, header with language + theme switchers,
// role-aware bottom navigation. One <h1> lives per page (not here) — this renders
// the <header>/<nav> landmarks only.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { SUPPORTED_LANGUAGES, type LanguageCode, languageInfo } from '@copa/core';
import { useSession } from '../lib/session';
import { catalog } from '../lib/strings';
import { type Theme, applyTheme, readTheme } from '../lib/theme';

interface NavItem {
  href: string;
  key: 'nav_home' | 'nav_map' | 'nav_assistant' | 'nav_ops' | 'nav_missions';
  personas: readonly string[];
}

const NAV: readonly NavItem[] = [
  { href: '/', key: 'nav_home', personas: ['fan', 'volunteer', 'organizer', 'staff'] },
  { href: '/map', key: 'nav_map', personas: ['fan', 'volunteer', 'staff'] },
  { href: '/assistant', key: 'nav_assistant', personas: ['fan', 'volunteer', 'organizer', 'staff'] },
  { href: '/ops', key: 'nav_ops', personas: ['organizer', 'staff'] },
  { href: '/missions', key: 'nav_missions', personas: ['fan'] },
];

export function Chrome({ children }: { children: ReactNode }): ReactNode {
  const session = useSession();
  const pathname = usePathname();
  const strings = catalog(session.language);
  const dir = languageInfo(session.language).dir;
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  // Keep <html lang/dir> in sync with the chosen language.
  useEffect(() => {
    document.documentElement.lang = session.language;
    document.documentElement.dir = dir;
  }, [session.language, dir]);

  const visibleNav = NAV.filter((item) => item.personas.includes(session.persona));

  function cycleTheme(): void {
    const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    setTheme(next);
    applyTheme(next);
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        {strings.skipToContent}
      </a>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--surface-edge)',
        }}
      >
        <Link href="/" style={{ fontWeight: 800, fontSize: 18, textDecoration: 'none', color: 'var(--text)' }}>
          ⚽ {strings.appName}
        </Link>
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)' }} htmlFor="lang-select">
            {strings.chooseLanguage}
          </label>
          <select
            id="lang-select"
            value={session.language}
            onChange={(e) => session.update({ language: e.target.value as LanguageCode })}
            style={{ minHeight: 40, borderRadius: 8, padding: '4px 8px', background: 'var(--bg-1)', color: 'var(--text)', border: '1px solid var(--surface-edge)' }}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName}
              </option>
            ))}
          </select>
          <button
            onClick={cycleTheme}
            aria-label={`Theme: ${theme}. Activate to change.`}
            style={{ minHeight: 40, minWidth: 40, borderRadius: 8, border: '1px solid var(--surface-edge)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
          >
            {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🌓'}
          </button>
        </div>
      </header>

      <main id="main-content" style={{ padding: '16px', paddingBottom: 90, maxWidth: 1100, margin: '0 auto' }}>
        {children}
      </main>

      <nav
        aria-label="Primary"
        style={{
          position: 'fixed',
          bottom: 0,
          insetInline: 0,
          display: 'flex',
          justifyContent: 'space-around',
          padding: '8px 4px',
          borderTop: '1px solid var(--surface-edge)',
          background: 'var(--bg-1)',
        }}
      >
        {visibleNav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              style={{
                minHeight: 44,
                minWidth: 64,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                textDecoration: 'none',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--primary)' : 'var(--text-dim)',
              }}
            >
              {strings[item.key]}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
