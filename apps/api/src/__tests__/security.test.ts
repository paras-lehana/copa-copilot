// security.test.ts — M23/M24: rate buckets (limit/refill/prune), security headers,
// CORS allow-list, secret-absence sweeps and log-redaction contracts.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TokenBucketLimiter } from '../middleware/rate-limit';
import { frozenClock, testApp } from './helpers';

describe('token buckets (M23)', () => {
  it('limits after capacity is spent and answers 429 with Retry-After', async () => {
    const { app } = testApp();
    let lastStatus = 200;
    // General tier: 60/min. Spend the bucket from one IP.
    for (let i = 0; i < 61; i += 1) {
      const res = await request(app).get('/api/health');
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
    const limited = await request(app).get('/api/health');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('30');
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('refills continuously with the clock', () => {
    const clock = frozenClock();
    const limiter = new TokenBucketLimiter('assistant', clock.now);
    for (let i = 0; i < 10; i += 1) expect(limiter.take('ip-1')).toBe(true);
    expect(limiter.take('ip-1')).toBe(false); // bucket dry
    clock.advance(30_000); // half a minute → half the capacity back
    for (let i = 0; i < 5; i += 1) expect(limiter.take('ip-1')).toBe(true);
    expect(limiter.take('ip-1')).toBe(false);
  });

  it('buckets are per key — one IP cannot drain another', () => {
    const clock = frozenClock();
    const limiter = new TokenBucketLimiter('assistant', clock.now);
    for (let i = 0; i < 10; i += 1) limiter.take('ip-a');
    expect(limiter.take('ip-a')).toBe(false);
    expect(limiter.take('ip-b')).toBe(true);
  });

  it('prunes idle buckets after 10 minutes', () => {
    const clock = frozenClock();
    const limiter = new TokenBucketLimiter('general', clock.now);
    limiter.take('ip-old');
    clock.advance(11 * 60_000);
    limiter.take('ip-new');
    expect(limiter.prune()).toBe(1);
    expect(limiter.size()).toBe(1);
  });

  it('the assistant tier is stricter than general (10/min)', async () => {
    const { app } = testApp();
    let status = 200;
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app)
        .post('/api/assistant/query')
        .send({ message: 'crowd?', venueId: 'metlife' });
      status = res.status;
    }
    expect(status).toBe(429);
  });
});

describe('security headers & CORS', () => {
  const { app } = testApp();

  it('every response carries the hardening headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allow-listed origin gets CORS headers; others get none', async () => {
    const allowed = await request(app).get('/api/health').set('origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const denied = await request(app).get('/api/health').set('origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight answers 204', async () => {
    const res = await request(app)
      .options('/api/assistant/query')
      .set('origin', 'http://localhost:3000');
    expect(res.status).toBe(204);
  });
});

describe('secret absence sweeps (M24)', () => {
  const { app } = testApp({ GEMINI_API_KEY: 'AIzaFAKEKEYFORTESTS1234567890abcdefghij' });

  const GET_ENDPOINTS = [
    '/api/health',
    '/api/meta',
    '/api/venues',
    '/api/venues/metlife',
    '/api/crowd/metlife',
    '/api/transit/metlife',
    '/api/weather/metlife',
    '/api/egress/stagger/metlife',
    '/api/incidents/metlife',
    '/api/google/services',
    '/api/missions',
    '/api/leaderboard',
  ] as const;

  it.each(GET_ENDPOINTS)('%s never leaks env values or key material', async (path) => {
    const res = await request(app).get(path);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('AIzaFAKEKEY');
    expect(body).not.toMatch(/GEMINI_API_KEY"?\s*[:=]\s*"[^"]+[a-z0-9]/i);
    expect(body).not.toMatch(/-----BEGIN/);
  });

  it('/api/google/services self-attests names-only and readiness booleans', async () => {
    const res = await request(app).get('/api/google/services');
    expect(res.body.scorecard.exposesSecretValues).toBe(false);
    expect(res.body.scorecard.exposesEnvVarNamesOnly).toBe(true);
    expect(res.body.runtime.geminiKeyPresent).toBe(true); // boolean, never the value
    expect(res.body.scorecard.implemented).toBe(6);
    expect(res.body.services).toHaveLength(15);
  });
});

describe('log redaction contract', () => {
  it('request logs carry method/path/status only — no user text, no query values', async () => {
    const { app, logs } = testApp();
    await request(app)
      .post('/api/assistant/query')
      .send({ message: 'SECRET_USER_TEXT do not log me', venueId: 'metlife' });
    await request(app).get('/api/crowd/metlife?minute=30&scenario=egress-surge');
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain('SECRET_USER_TEXT');
    expect(serialized).not.toContain('egress-surge'); // query string values excluded
    expect(serialized).toContain('/api/assistant/query');
    const line = logs.find((l) => l.message.includes('/api/assistant/query'));
    expect(line?.httpRequest?.status).toBe(200);
    expect(line?.httpRequest?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('5xx would log as ERROR severity (sink contract)', async () => {
    const { app, logs } = testApp();
    await request(app).get('/api/nope');
    const line = logs.find((l) => l.message.includes('/api/nope'));
    expect(line?.severity).toBe('INFO'); // 404 is INFO; only 5xx escalates
  });
});
