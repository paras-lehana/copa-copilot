import { type ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from '../lib/session';
import { Chrome } from '../components/Chrome';
import { THEME_BOOTSTRAP_SCRIPT } from '../lib/theme';
import { A11Y_BOOTSTRAP_SCRIPT } from '../lib/a11y-prefs';

export const metadata: Metadata = {
  title: 'Copa Copilot — Smart Stadium Copilot for FIFA World Cup 2026',
  description:
    'GenAI operations and fan copilot for the FIFA World Cup 2026: crowd-aware routing, exit-wave advice, weather protocols, multilingual assistance and live operational intelligence across all 16 stadiums.',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Set the theme + accessibility preferences before paint to avoid a flash.
            Both are static strings with no user input. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <SessionProvider>
          <Chrome>{children}</Chrome>
        </SessionProvider>
      </body>
    </html>
  );
}
