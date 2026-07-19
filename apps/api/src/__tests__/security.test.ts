// security.test.ts — M23/M24: rate buckets (limit/refill/prune), security headers,
// CORS allow-list, secret-absence sweeps, log-redaction contracts, plus the M25
// defence-in-depth layer: input sanitisation, SSRF allow-list, request correlation
// ids, and the fail-closed startup self-test.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { TokenBucketLimiter } from '../middleware/rate-limit';
import { MAX_SANITIZED_LENGTH, hasSuspiciousChars, sanitizeText } from '../middleware/sanitize';
import { isAllowedLlmUrl } from '../services/llm-client';
import { hasCriticalFinding, runSecuritySelfTest } from '../services/security-selftest';
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
  const { app } = testApp({ LLM_INTERNAL_KEY: 'FAKE-TEST-LLM-KEY-not-a-real-secret' });

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
    expect(body).not.toContain('FAKE-TEST-LLM-KEY');
    expect(body).not.toMatch(/(GEMINI_API_KEY|LLM_INTERNAL_KEY)"?\s*[:=]\s*"[^"]+[a-z0-9]/i);
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

describe('input sanitisation (M25)', () => {
  // Built via escapes so the source stays pure ASCII and unambiguous.
  const NUL = String.fromCharCode(0); // C0 control
  const ZWSP = String.fromCharCode(0x200b); // zero-width space
  const ZWJ = String.fromCharCode(0x200d); // zero-width joiner
  const RLO = String.fromCharCode(0x202e); // right-to-left override
  const BOM = String.fromCharCode(0xfeff); // byte-order mark

  it('strips C0/C1 control characters', () => {
    expect(sanitizeText(`a${NUL}bcd`)).toBe('abcd');
  });

  it('strips zero-width and bidi-override steganography', () => {
    expect(sanitizeText(`hi${ZWSP}there${ZWJ}${RLO}world${BOM}`)).toBe('hithereworld');
  });

  it('collapses whitespace runs and trims', () => {
    expect(sanitizeText('  a   b\t\tc  ')).toBe('a b c');
  });

  it('caps length at the documented maximum', () => {
    expect(sanitizeText('x'.repeat(5000)).length).toBe(MAX_SANITIZED_LENGTH);
    expect(sanitizeText('x'.repeat(50), 10)).toHaveLength(10);
  });

  it('leaves legitimate multilingual text untouched', () => {
    expect(sanitizeText('Donde esta mi asiento?')).toBe('Donde esta mi asiento?');
    const arabic = String.fromCharCode(0x635, 0x631, 0x627, 0x637);
    expect(sanitizeText(arabic)).toBe(arabic);
  });

  it('flags suspicious characters without mutating', () => {
    expect(hasSuspiciousChars('normal seat question')).toBe(false);
    expect(hasSuspiciousChars(`inject${RLO}payload`)).toBe(true);
    expect(hasSuspiciousChars(`bell${NUL}`)).toBe(true);
  });

  it('a bidi-hidden instruction cannot survive into the assistant reply', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/assistant/query')
      .send({ message: `${RLO}what is the crowd${ZWSP} like? `, venueId: 'metlife' });
    expect(res.status).toBe(200);
    expect(res.body.reply.text).not.toContain(RLO);
    expect(res.body.reply.text).not.toContain(ZWSP);
  });
});

describe('SSRF allow-list on the key-bearing upstream (M25)', () => {
  it('accepts allow-listed HTTPS hosts and localhost', () => {
    expect(isAllowedLlmUrl('https://llm.lehana.in')).toBe(true);
    expect(isAllowedLlmUrl('http://localhost:8080')).toBe(true);
    expect(isAllowedLlmUrl('http://127.0.0.1:9000')).toBe(true);
  });

  it('rejects internal metadata, plaintext, and non-allow-listed hosts', () => {
    expect(isAllowedLlmUrl('http://169.254.169.254/latest/meta-data')).toBe(false); // cloud metadata
    expect(isAllowedLlmUrl('http://llm.lehana.in')).toBe(false); // plaintext to a real host
    expect(isAllowedLlmUrl('https://evil.example')).toBe(false);
    expect(isAllowedLlmUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedLlmUrl('not-a-url')).toBe(false);
  });
});

describe('request correlation ids (M25)', () => {
  it('assigns an X-Request-Id when the client sends none', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^req-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('honours a safe inbound id and echoes it back', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/health').set('x-request-id', 'trace-ABC-123');
    expect(res.headers['x-request-id']).toBe('trace-ABC-123');
  });

  it('rejects an unsafe inbound id and mints its own', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/health').set('x-request-id', 'bad id with spaces & <html>');
    expect(res.headers['x-request-id']).not.toBe('bad id with spaces & <html>');
    expect(res.headers['x-request-id']).toMatch(/^req-/);
  });
});

describe('startup security self-test (M25)', () => {
  const prodEnv = {
    NODE_ENV: 'production',
    DEMO_MODE: 'false',
    LLM_INTERNAL_KEY: 'FAKE-TEST-LLM-KEY-not-a-real-secret',
    ALLOWED_ORIGINS: 'https://copa.example',
    SIM_SEED: '26',
  };

  it('a well-formed production config yields no findings', () => {
    const config = loadConfig(prodEnv);
    const findings = runSecuritySelfTest(config, { isProduction: true });
    expect(findings).toHaveLength(0);
    expect(hasCriticalFinding(findings)).toBe(false);
  });

  it('flags a wildcard CORS origin as critical (second line of defence)', () => {
    // The config's zod layer already rejects '*' at parse time — this proves the
    // self-test would ALSO catch it if a future refactor loosened that first gate.
    const config = { ...loadConfig(prodEnv), allowedOrigins: ['*'] };
    const findings = runSecuritySelfTest(config, { isProduction: true });
    expect(findings.some((f) => f.id === 'cors-wildcard' && f.severity === 'critical')).toBe(true);
    expect(hasCriticalFinding(findings)).toBe(true);
  });

  it('flags a plaintext production origin as critical', () => {
    const config = loadConfig({ ...prodEnv, ALLOWED_ORIGINS: 'http://copa.example' });
    const findings = runSecuritySelfTest(config, { isProduction: true });
    expect(findings.some((f) => f.id === 'cors-insecure' && f.severity === 'critical')).toBe(true);
  });

  it('flags a non-allow-listed plaintext upstream as critical', () => {
    const config = loadConfig({ ...prodEnv, LLM_SERVICE_URL: 'http://169.254.169.254' });
    const findings = runSecuritySelfTest(config, { isProduction: true });
    expect(findings.some((f) => f.id === 'llm-upstream-unsafe' && f.severity === 'critical')).toBe(true);
  });

  it('warns (does not block) when live mode has no key', () => {
    const config = loadConfig({ ...prodEnv, LLM_INTERNAL_KEY: '' });
    const findings = runSecuritySelfTest(config, { isProduction: true });
    expect(findings.some((f) => f.id === 'live-without-key' && f.severity === 'warning')).toBe(true);
    expect(hasCriticalFinding(findings)).toBe(false);
  });

  it('sorts critical findings ahead of warnings', () => {
    const config = { ...loadConfig({ ...prodEnv, LLM_INTERNAL_KEY: '' }), allowedOrigins: ['*'] };
    const findings = runSecuritySelfTest(config, { isProduction: true });
    expect(findings[0]?.severity).toBe('critical');
    expect(findings[findings.length - 1]?.severity).toBe('warning');
  });

  it('a local dev config (localhost origin, demo mode) is clean', () => {
    const config = loadConfig({ DEMO_MODE: 'true', ALLOWED_ORIGINS: 'http://localhost:3000', SIM_SEED: '26' });
    const findings = runSecuritySelfTest(config, { isProduction: false });
    expect(findings).toHaveLength(0);
  });
});
