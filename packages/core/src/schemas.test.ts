// schemas.test.ts — M19/M20: every schema is strict + rejects invalid-input classes,
// and validation errors NEVER echo raw input values.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ALL_REQUEST_SCHEMAS,
  ASSISTANT_INPUT_MAX_CHARS,
  assistantQuerySchema,
  bootstrapSchema,
  incidentReportSchema,
  missionClaimSchema,
  routingRequestSchema,
  safeErrorMap,
} from './schemas';

const SCHEMA_NAMES = Object.keys(ALL_REQUEST_SCHEMAS) as (keyof typeof ALL_REQUEST_SCHEMAS)[];

/** A valid payload per schema — the base each invalid-class case mutates. */
const VALID: Record<keyof typeof ALL_REQUEST_SCHEMAS, Record<string, unknown>> = {
  crowdQuerySchema: { scenario: 'normal', minute: 30 },
  routingRequestSchema: {
    venueId: 'metlife',
    fromZoneId: 'gate-d',
    toZoneId: 'sec-124',
    profile: 'none',
    scenario: 'normal',
    minute: 30,
  },
  egressRequestSchema: { venueId: 'metlife', mode: 'rail', scenario: 'egress-surge' },
  weatherQuerySchema: { preset: 'clear-day', minute: 30 },
  incidentReportSchema: {
    venueId: 'metlife',
    zoneId: 'concourse-n',
    category: 'crowd',
    severity: 'high',
    summary: 'Congestion at the north stairs',
    minute: 30,
  },
  entryFactsSchema: {
    venueId: 'metlife',
    ticketSource: 'official',
    transferConfirmed: true,
    idPacked: true,
    bagCompliant: true,
  },
  assistantQuerySchema: { message: 'Where is my gate?', venueId: 'metlife', persona: 'fan' },
  briefingRequestSchema: { venueId: 'metlife', windowMinutes: 15, role: 'organizer' },
  bootstrapSchema: { displayName: 'Fan One', venueId: 'metlife', sectionZoneId: 'sec-111' },
  missionClaimSchema: { userId: 'u-1', missionId: 'route-follow', minute: 30 },
  leaderboardQuerySchema: { scope: 'venue', venueId: 'metlife' },
};

describe('all schemas accept their canonical valid payload', () => {
  it.each(SCHEMA_NAMES)('%s parses its valid payload', (name) => {
    const parsed = ALL_REQUEST_SCHEMAS[name].safeParse(VALID[name]);
    expect(parsed.success, JSON.stringify(!parsed.success ? parsed.error.issues : '')).toBe(true);
  });
});

describe('strictness: unknown keys rejected everywhere (M19)', () => {
  it.each(SCHEMA_NAMES)('%s rejects an extra key', (name) => {
    const parsed = ALL_REQUEST_SCHEMAS[name].safeParse({
      ...VALID[name],
      totallyUnexpectedKey: 'x',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('invalid-input classes (M19)', () => {
  it.each(SCHEMA_NAMES)('%s rejects a null payload', (name) => {
    expect(ALL_REQUEST_SCHEMAS[name].safeParse(null).success).toBe(false);
  });

  it('enum violations reject (venue, scenario, mode, category)', () => {
    expect(routingRequestSchema.safeParse({ ...VALID.routingRequestSchema, venueId: 'narnia' }).success).toBe(false);
    expect(routingRequestSchema.safeParse({ ...VALID.routingRequestSchema, scenario: 'apocalypse' }).success).toBe(false);
    expect(incidentReportSchema.safeParse({ ...VALID.incidentReportSchema, category: 'aliens' }).success).toBe(false);
  });

  it('oversize inputs reject (assistant budget, display name, summary)', () => {
    expect(
      assistantQuerySchema.safeParse({
        ...VALID.assistantQuerySchema,
        message: 'x'.repeat(ASSISTANT_INPUT_MAX_CHARS + 1),
      }).success,
    ).toBe(false);
    expect(
      bootstrapSchema.safeParse({ ...VALID.bootstrapSchema, displayName: 'x'.repeat(31) }).success,
    ).toBe(false);
    expect(
      incidentReportSchema.safeParse({ ...VALID.incidentReportSchema, summary: 'x'.repeat(241) }).success,
    ).toBe(false);
  });

  it('markup rejects on display strings (stored-XSS defence)', () => {
    expect(
      bootstrapSchema.safeParse({ ...VALID.bootstrapSchema, displayName: '<b>fan</b>' }).success,
    ).toBe(false);
    expect(
      incidentReportSchema.safeParse({
        ...VALID.incidentReportSchema,
        summary: '<script>alert(1)</script>',
      }).success,
    ).toBe(false);
  });

  it('boundary violations reject (minute range, points range, distance range)', () => {
    expect(routingRequestSchema.safeParse({ ...VALID.routingRequestSchema, minute: 500 }).success).toBe(false);
    expect(bootstrapSchema.safeParse({ ...VALID.bootstrapSchema, claimedPoints: -1 }).success).toBe(false);
    expect(
      missionClaimSchema.safeParse({ ...VALID.missionClaimSchema, commuteDistanceKm: 9999 }).success,
    ).toBe(false);
  });
});

describe('no raw-input echo in error messages (M20)', () => {
  const SECRET = 'SUPER_SECRET_VALUE_12345';

  function messagesFor(schemaName: keyof typeof ALL_REQUEST_SCHEMAS, payload: unknown): string {
    const parsed = ALL_REQUEST_SCHEMAS[schemaName].safeParse(payload, { errorMap: safeErrorMap });
    if (parsed.success) return '';
    return parsed.error.issues.map((i) => i.message).join(' | ');
  }

  it.each(SCHEMA_NAMES)('%s: wrong-type errors never contain the offending value', (name) => {
    const firstKey = Object.keys(VALID[name])[0];
    if (firstKey === undefined) return;
    const msgs = messagesFor(name, { ...VALID[name], [firstKey]: SECRET });
    expect(msgs).not.toContain(SECRET);
  });

  it('enum violations name the field, not the value', () => {
    const msgs = messagesFor('routingRequestSchema', {
      ...VALID.routingRequestSchema,
      venueId: SECRET,
    });
    expect(msgs).toContain('venueId');
    expect(msgs).not.toContain(SECRET);
  });

  it('unknown-key violations reveal neither key value nor content', () => {
    const msgs = messagesFor('bootstrapSchema', { ...VALID.bootstrapSchema, [SECRET]: 'x' });
    expect(msgs).not.toContain(SECRET);
  });

  it('the safe error map covers invalid_type, too_big, too_small', () => {
    expect(messagesFor('assistantQuerySchema', { ...VALID.assistantQuerySchema, message: 5 })).toMatch(
      /wrong type/,
    );
    expect(
      messagesFor('assistantQuerySchema', {
        ...VALID.assistantQuerySchema,
        message: 'x'.repeat(2000),
      }),
    ).toMatch(/too (large|long)/i);
    expect(messagesFor('assistantQuerySchema', { ...VALID.assistantQuerySchema, message: '' })).toMatch(
      /too small|missing/i,
    );
  });
});

describe('defaults apply', () => {
  it('crowd query defaults scenario and minute', () => {
    const parsed = ALL_REQUEST_SCHEMAS.crowdQuerySchema.parse({});
    expect(parsed).toEqual({ scenario: 'normal', minute: 30 });
  });

  it('assistant defaults persona/tier/scenario', () => {
    const parsed = assistantQuerySchema.parse({ message: 'hi', venueId: 'metlife' });
    expect(parsed.persona).toBe('fan');
    expect(parsed.literacyTier).toBe('standard');
  });
});

describe('zod version sanity', () => {
  it('safeErrorMap is a valid ZodErrorMap', () => {
    expect(typeof safeErrorMap).toBe('function');
    expect(z).toBeDefined();
  });
});
