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
import { z } from 'zod';
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

/** Runtime shape of the persisted session — every field optional and validated, so a
 *  corrupt or tampered blob is coerced to a safe partial rather than cast blindly. */
const storedSessionSchema = z
  .object({
    venueId: z.string(),
    sectionZoneId: z.string(),
    persona: z.enum(['fan', 'volunteer', 'organizer', 'staff']),
    language: z.string(),
    accessibility: z.enum(['none', 'wheelchair', 'low-vision', 'sensory-sensitive']),
    displayName: z.string(),
    onboarded: z.boolean(),
  })
  .partial();

type StoredSession = z.infer<typeof storedSessionSchema>;

/** Parse stored session defensively — a corrupt blob resets to defaults, never throws.
 *  `language` stays a raw string here; the provider re-narrows it via resolveLanguage. */
function readStored(): StoredSession {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = storedSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
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
