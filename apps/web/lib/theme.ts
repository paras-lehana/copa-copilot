// theme.ts — light/dark/system theme handling.
// The initial theme is applied by an inline script (see layout) that sets
// data-theme BEFORE paint to avoid a flash. This module drives the runtime toggle.

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'copa-theme';

/** Read the persisted preference (defaults to system). */
export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** Apply a theme to the document root and persist it. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    root.setAttribute('data-theme', theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
}

/** The tiny script inlined in <head> to set the theme before first paint. */
export const THEME_BOOTSTRAP_SCRIPT = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}`;
