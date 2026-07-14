'use client';

// session.tsx — the client session context: venue, language, accessibility profile,
// persona and the anonymous profile. SSR-safe: nothing reads localStorage during
// render (only inside effects), which avoids hydration mismatches. Corrupt stored
// state is guarded, never thrown.

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type LanguageCode, resolveLanguage } from '@copa/core';
import { type Profile } from './contracts';

/** Personas the app serves. */
export type Persona = 'fan' | 'volunteer' | 'organizer' | 'staff';
/** Accessibility profiles that change routing + assistant behaviour. */
export type AccessibilityProfile = 'none' | 'wheelchair' | 'low-vision' | 'sensory-sensitive';

/** Everything the session holds. */
export interface SessionState {
  venueId: string;
  sectionZoneId: string;
  persona: Persona;
  language: LanguageCode;
  accessibility: AccessibilityProfile;
  displayName: string;
  profile: Profile | undefined;
  onboarded: boolean;
}

interface SessionContextValue extends SessionState {
  update: (patch: Partial<SessionState>) => void;
  reset: () => void;
}

const DEFAULT_STATE: SessionState = {
  venueId: 'metlife',
  sectionZoneId: 'sec-124',
  persona: 'fan',
  language: 'en',
  accessibility: 'none',
  displayName: 'Guest',
  profile: undefined,
  onboarded: false,
};

const STORAGE_KEY = 'copa-session';
const SessionContext = createContext<SessionContextValue | undefined>(undefined);

/** Parse stored session defensively — a corrupt blob resets to defaults, never throws. */
function readStored(): Partial<SessionState> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Partial<SessionState>;
  } catch {
    return {};
  }
}

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<SessionState>(DEFAULT_STATE);

  // Hydrate from storage AFTER mount (SSR-safe).
  useEffect(() => {
    const stored = readStored();
    if (Object.keys(stored).length > 0) {
      setState((prev) => ({ ...prev, ...stored, language: resolveLanguage(stored.language) }));
    }
  }, []);

  const update = useCallback((patch: Partial<SessionState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage full/blocked: keep the in-memory session working regardless.
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setState(DEFAULT_STATE);
  }, []);

  const value = useMemo<SessionContextValue>(() => ({ ...state, update, reset }), [state, update, reset]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Access the session; throws only if used outside the provider (a dev error). */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === undefined) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
