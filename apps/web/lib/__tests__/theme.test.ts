// theme.test.ts — theme persistence and the pre-paint bootstrap script.
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_BOOTSTRAP_SCRIPT, applyTheme, readTheme } from '../theme';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('applyTheme / readTheme', () => {
  it('defaults to system with nothing stored', () => {
    expect(readTheme()).toBe('system');
  });

  it('persists and reflects an explicit theme on the root', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(readTheme()).toBe('dark');
  });

  it('system clears the attribute and storage', () => {
    applyTheme('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(readTheme()).toBe('system');
  });

  it('ignores a corrupt stored value', () => {
    window.localStorage.setItem('copa-theme', 'chartreuse');
    expect(readTheme()).toBe('system');
  });
});

describe('bootstrap script', () => {
  it('is inline, self-contained and references no external anything', () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('localStorage');
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('data-theme');
    expect(THEME_BOOTSTRAP_SCRIPT).not.toContain('http');
  });
});
