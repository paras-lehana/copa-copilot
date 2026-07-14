// errors.test.ts — M21: every ErrorCode maps to a valid status and safe localized copy.
import { describe, expect, it } from 'vitest';
import { ALL_ERROR_CODES, appError, httpStatusFor, safeMessageFor } from './errors';
import { SUPPORTED_LANGUAGES } from './i18n';

const LANGUAGES = SUPPORTED_LANGUAGES.map((l) => l.code);

describe('error taxonomy exhaustiveness (M21)', () => {
  it.each(ALL_ERROR_CODES)('%s maps to a valid HTTP status', (code) => {
    const status = httpStatusFor(code);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThanOrEqual(599);
  });

  it.each(
    ALL_ERROR_CODES.flatMap((code) => LANGUAGES.map((lang) => [code, lang] as const)),
  )('%s has a non-empty safe message in %s', (code, lang) => {
    const message = safeMessageFor(code, lang);
    expect(message.length).toBeGreaterThan(10);
    // Safe messages are static copy: no interpolation targets, no stack markers.
    expect(message).not.toMatch(/\{|\}|%s|Error:|stack/i);
  });

  it('client errors are 4xx and server errors are 5xx', () => {
    expect(httpStatusFor('VALIDATION_FAILED')).toBe(400);
    expect(httpStatusFor('NOT_FOUND')).toBe(404);
    expect(httpStatusFor('PAYLOAD_TOO_LARGE')).toBe(413);
    expect(httpStatusFor('MISSION_REJECTED')).toBe(422);
    expect(httpStatusFor('RATE_LIMITED')).toBe(429);
    expect(httpStatusFor('INTERNAL')).toBe(500);
    expect(httpStatusFor('UPSTREAM_FAILURE')).toBe(502);
    expect(httpStatusFor('ASSISTANT_UNAVAILABLE')).toBe(503);
  });
});

describe('appError', () => {
  it('carries diagnostics only when provided', () => {
    expect(appError('NOT_FOUND')).toEqual({ code: 'NOT_FOUND' });
    expect(appError('NOT_FOUND', 'venue "x"').diagnostics).toBe('venue "x"');
  });

  it('falls back to English for message lookups', () => {
    expect(safeMessageFor('INTERNAL')).toBe(safeMessageFor('INTERNAL', 'en'));
  });
});
