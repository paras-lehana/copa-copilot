'use client';

// Chrome.tsx — the app shell in the StadiumFlow aesthetic: skip link, gradient-logo
// header with language + theme switchers, ambient page glow, an animated bottom nav
// (framer-motion shared-layout indicator), and a floating assistant launcher that
// opens the slide-over copilot. One <h1> lives per page (not here).

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SUPPORTED_LANGUAGES, languageInfo, resolveLanguage } from '@copa/core';
import { useSession } from '../lib/session';
import { catalog } from '../lib/strings';
import { type Theme, applyTheme, readTheme } from '../lib/theme';
import { AssistantPanel } from './AssistantPanel';

interface NavItem {
  href: string;
  key: 'nav_home' | 'nav_map' | 'nav_ops' | 'nav_missions';
  icon: string;
  personas: readonly string[];
}

const NAV: readonly NavItem[] = [
  { href: '/', key: 'nav_home', icon: '🏟️', personas: ['fan', 'volunteer', 'organizer', 'staff'] },
  { href: '/map', key: 'nav_map', icon: '🗺️', personas: ['fan', 'volunteer', 'staff'] },
  { href: '/ops', key: 'nav_ops', icon: '📊', personas: ['organizer', 'staff'] },
  { href: '/missions', key: 'nav_missions', icon: '🎯', personas: ['fan'] },
];

export function Chrome({ children }: { children: ReactNode }): ReactNode {
  const session = useSession();
  const pathname = usePathname();
  const strings = catalog(session.language);
  const dir = languageInfo(session.language).dir;
  const [theme, setTheme] = useState<Theme>('system');
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

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
    <div className="ambient min-h-screen">
      <a href="#main-content" className="skip-link">
        {strings.skipToContent}
      </a>

      <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--surface-edge)] backdrop-blur-xl sticky top-0 z-40 bg-[color-mix(in_srgb,var(--bg-1)_82%,transparent)]">
        <Link href="/" className="flex items-center gap-2.5 no-underline text-[var(--text)]">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] grid place-items-center text-lg shadow-lg">
            ⚽
          </span>
          <span className="font-extrabold text-lg tracking-tight">
            Copa <span className="text-gradient">Copilot</span>
          </span>
        </Link>
        <div className="ms-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="lang-select">
            {strings.chooseLanguage}
          </label>
          <select
            id="lang-select"
            value={session.language}
            onChange={(e) => session.update({ language: resolveLanguage(e.target.value) })}
            aria-label={strings.chooseLanguage}
            className="min-h-[40px] rounded-lg px-2 py-1 bg-[var(--surface-solid)] text-[var(--text)] border border-[var(--surface-edge)] text-sm"
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
            className="min-h-[40px] min-w-[40px] rounded-lg border border-[var(--surface-edge)] bg-transparent text-[var(--text)] cursor-pointer"
          >
            {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🌓'}
          </button>
        </div>
      </header>

      <main id="main-content" className="px-4 pt-5 pb-28 max-w-5xl mx-auto">
        {children}
      </main>

      {/* Floating assistant launcher (hidden on the assistant page itself). */}
      {pathname !== '/assistant' && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setChatOpen(true)}
          aria-label="Open the Copa Copilot assistant"
          className="fixed bottom-24 end-4 w-14 h-14 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] grid place-items-center text-2xl shadow-2xl z-40"
        >
          ✨
        </motion.button>
      )}

      <nav
        aria-label="Primary"
        className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--surface-edge)] backdrop-blur-xl bg-[color-mix(in_srgb,var(--bg-1)_88%,transparent)]"
      >
        <div className="max-w-md mx-auto flex items-center justify-around py-2 px-2">
          {visibleNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center gap-0.5 py-1 px-3 min-w-[64px] min-h-[44px] no-underline justify-center"
              >
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-[var(--primary)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span aria-hidden="true" className={`text-xl transition-transform ${active ? 'scale-110' : ''}`}>
                  {item.icon}
                </span>
                <span
                  className={`text-[10px] font-semibold ${active ? 'text-[var(--primary)]' : 'text-[var(--text-dim)]'}`}
                >
                  {strings[item.key]}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <AssistantPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
