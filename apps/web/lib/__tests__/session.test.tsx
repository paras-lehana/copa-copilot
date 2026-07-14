// session.test.tsx — session context: hydration, updates, corrupt-guard, reset.
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionProvider, useSession } from '../session';

afterEach(() => window.localStorage.clear());

function wrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

describe('SessionProvider', () => {
  it('starts with sensible defaults', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.venueId).toBe('metlife');
    expect(result.current.persona).toBe('fan');
    expect(result.current.language).toBe('en');
    expect(result.current.onboarded).toBe(false);
  });

  it('update patches state and persists', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    act(() => result.current.update({ persona: 'organizer', venueId: 'arrowhead' }));
    expect(result.current.persona).toBe('organizer');
    expect(result.current.venueId).toBe('arrowhead');
    expect(window.localStorage.getItem('copa-session')).toContain('organizer');
  });

  it('hydrates from stored state on mount, resolving the language', () => {
    window.localStorage.setItem(
      'copa-session',
      JSON.stringify({ persona: 'volunteer', language: 'pt-BR' }),
    );
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.persona).toBe('volunteer');
    expect(result.current.language).toBe('pt'); // regional tag resolved to base
  });

  it('survives a corrupt stored blob (no throw, falls back to defaults)', () => {
    window.localStorage.setItem('copa-session', '{not json');
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.persona).toBe('fan');
  });

  it('reset clears storage and returns to defaults', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    act(() => result.current.update({ persona: 'staff' }));
    act(() => result.current.reset());
    expect(result.current.persona).toBe('fan');
    expect(window.localStorage.getItem('copa-session')).toBeNull();
  });

  it('throws only when used outside the provider (developer error)', () => {
    function Bad() {
      useSession();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(/within SessionProvider/);
    // keep screen import used
    expect(screen).toBeDefined();
  });
});
