// api-client.test.ts — the client validates responses and never casts blindly.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiGet, apiPost } from '../api-client';

const schema = z.object({ value: z.number() });

afterEach(() => vi.restoreAllMocks());

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe('apiGet', () => {
  it('returns ok with parsed data on a valid response', async () => {
    mockFetch(200, { value: 42 });
    const r = await apiGet('/x', schema);
    expect(r.ok && r.value.value).toBe(42);
  });

  it('flags a schema mismatch as BAD_RESPONSE (no blind cast)', async () => {
    mockFetch(200, { value: 'not a number' });
    const r = await apiGet('/x', schema);
    expect(!r.ok && r.code).toBe('BAD_RESPONSE');
  });

  it('surfaces the server error envelope', async () => {
    mockFetch(404, { error: { code: 'NOT_FOUND', message: 'nope' } });
    const r = await apiGet('/x', schema);
    expect(!r.ok && r.code).toBe('NOT_FOUND');
    expect(!r.ok && r.message).toBe('nope');
  });

  it('maps a non-enveloped error to HTTP_ERROR', async () => {
    mockFetch(500, { oops: true });
    const r = await apiGet('/x', schema);
    expect(!r.ok && r.code).toBe('HTTP_ERROR');
  });

  it('maps a network failure to NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const r = await apiGet('/x', schema);
    expect(!r.ok && r.code).toBe('NETWORK');
  });
});

describe('apiPost', () => {
  it('sends JSON and validates the response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: 7 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await apiPost('/y', { a: 1 }, schema);
    expect(r.ok && r.value.value).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/y'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
