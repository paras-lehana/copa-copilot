// use-api.test.tsx — the data hook's loading → data / error → reload lifecycle.
import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useApi } from '../use-api';

const schema = z.object({ n: z.number() });

afterEach(() => vi.restoreAllMocks());

describe('useApi', () => {
  it('starts loading, then resolves data on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ n: 7 }), { status: 200 })));
    const { result } = renderHook(() => useApi('/x', schema));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ n: 7 });
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces a server error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'nope' } }), { status: 404 })),
    );
    const { result } = renderHook(() => useApi('/x', schema));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('nope');
    expect(result.current.data).toBeUndefined();
  });

  it('flags a schema mismatch rather than trusting the payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ n: 'not-a-number' }), { status: 200 })));
    const { result } = renderHook(() => useApi('/x', schema));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeDefined();
  });

  it('reload re-fetches', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ n: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useApi('/x', schema));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = fetchMock.mock.calls.length;
    act(() => result.current.reload());
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
