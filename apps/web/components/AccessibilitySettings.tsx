'use client';

// AccessibilitySettings.tsx — the in-app accessibility control panel (WCAG 1.4.4,
// 1.4.8, 1.4.12, 2.3.3). Every control is a real radio group inside a labelled
// <fieldset>, fully keyboard-operable, with the current choice announced via the
// native checked state. Choosing an option applies it LIVE (no save button) and
// persists it, so the whole app reshapes immediately for the user.

import { type ReactNode, useEffect, useState } from 'react';
import {
  type A11yPrefs,
  DEFAULT_A11Y_PREFS,
  applyA11yPrefs,
  readA11yPrefs,
  writeA11yPrefs,
} from '../lib/a11y-prefs';
import { Button } from './ui';

/** One selectable option in a preference group. */
interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** A labelled radio group bound to one preference key. */
function PrefGroup<K extends keyof A11yPrefs>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: A11yPrefs[K];
  options: Option<A11yPrefs[K]>[];
  onChange: (next: A11yPrefs[K]) => void;
}): ReactNode {
  return (
    <fieldset className="border border-[var(--surface-edge)] rounded-xl p-3 m-0 min-w-0">
      <legend className="text-sm font-bold px-1">{legend}</legend>
      <div className="grid gap-2 mt-1">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-start gap-2.5 cursor-pointer text-sm rounded-lg px-2 py-1.5 hover:bg-[color-mix(in_srgb,var(--text-dim)_10%,transparent)]"
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 accent-[var(--primary)] min-w-[16px] min-h-[16px]"
            />
            <span>
              <span className="font-medium">{opt.label}</span>
              {opt.hint !== undefined && (
                <span className="block text-xs text-[var(--text-dim)]">{opt.hint}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The accessibility settings panel. Reads persisted preferences after mount (SSR-safe),
 * applies every change to the document root immediately, and persists it. A reset
 * button restores the defaults (which defer to the user's OS/browser settings).
 */
export function AccessibilitySettings(): ReactNode {
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_A11Y_PREFS);
  const [hydrated, setHydrated] = useState(false);

  // Load the persisted preferences once, after mount.
  useEffect(() => {
    const stored = readA11yPrefs();
    setPrefs(stored);
    applyA11yPrefs(stored);
    setHydrated(true);
  }, []);

  function change<K extends keyof A11yPrefs>(key: K, next: A11yPrefs[K]): void {
    const updated = { ...prefs, [key]: next };
    setPrefs(updated);
    applyA11yPrefs(updated);
    writeA11yPrefs(updated);
  }

  function reset(): void {
    setPrefs(DEFAULT_A11Y_PREFS);
    applyA11yPrefs(DEFAULT_A11Y_PREFS);
    writeA11yPrefs(DEFAULT_A11Y_PREFS);
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-[var(--text-dim)] m-0">
        These settings change how the whole app looks for you and are remembered on this
        device. They work even if you cannot change your operating-system settings.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <PrefGroup<'contrast'>
          legend="Contrast"
          name="a11y-contrast"
          value={prefs.contrast}
          onChange={(v) => change('contrast', v)}
          options={[
            { value: 'normal', label: 'Standard' },
            { value: 'high', label: 'High contrast', hint: 'Stronger borders and text separation' },
          ]}
        />
        <PrefGroup<'textScale'>
          legend="Text size"
          name="a11y-text"
          value={prefs.textScale}
          onChange={(v) => change('textScale', v)}
          options={[
            { value: 'normal', label: 'Default' },
            { value: 'large', label: 'Large', hint: '+12.5%' },
            { value: 'xlarge', label: 'Extra large', hint: '+25%' },
          ]}
        />
        <PrefGroup<'font'>
          legend="Reading font"
          name="a11y-font"
          value={prefs.font}
          onChange={(v) => change('font', v)}
          options={[
            { value: 'default', label: 'Default' },
            { value: 'dyslexic', label: 'Dyslexia-friendly', hint: 'Rounder face, wider spacing' },
          ]}
        />
        <PrefGroup<'motion'>
          legend="Motion"
          name="a11y-motion"
          value={prefs.motion}
          onChange={(v) => change('motion', v)}
          options={[
            { value: 'system', label: 'Use my system setting' },
            { value: 'reduce', label: 'Reduce motion', hint: 'Stop animations and transitions' },
          ]}
        />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" onClick={reset}>
          Reset to defaults
        </Button>
        {hydrated && (
          <span role="status" className="text-xs text-[var(--text-dim)]">
            Changes apply instantly and are saved on this device.
          </span>
        )}
      </div>
    </div>
  );
}
