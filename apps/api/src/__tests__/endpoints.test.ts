// endpoints.test.ts — M22: the endpoint contract matrix (success/400/404/429/413)
// plus per-endpoint semantic checks against the engine.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { simulateVenue } from '@copa/core';
import { testApp } from './helpers';

describe('GET endpoints return engine-true data', () => {
  const { app, config } = testApp();

  it('/api/health is ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('/api/meta serves version and uptime — and NO demo/config flags', async () => {
    const res = await request(app).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.2.0');
    expect(res.body.service).toBe('copa-copilot-api');
    // The documented regression: demo/bypass state must never be public.
    expect(JSON.stringify(res.body)).not.toMatch(/demo|bypass|apiKey|secret/i);
  });

  it('/api/venues lists all 16 venues', async () => {
    const res = await request(app).get('/api/venues');
    expect(res.status).toBe(200);
    expect(res.body.venues).toHaveLength(16);
  });

  it('/api/venues/:id returns the graph for the flagship', async () => {
    const res = await request(app).get('/api/venues/metlife');
    expect(res.status).toBe(200);
    expect(res.body.venue.flagship).toBe(true);
    expect(res.body.zones.length).toBeGreaterThan(15);
    expect(res.body.edges.length).toBeGreaterThan(20);
  });

  it('/api/crowd/:venueId matches a direct engine call exactly (no fixture drift)', async () => {
    const res = await request(app).get('/api/crowd/metlife?scenario=egress-surge&minute=130');
    expect(res.status).toBe(200);
    const engine = simulateVenue('metlife', 'egress-surge', 130, config.simSeed);
    expect(res.body.snapshot).toEqual(JSON.parse(JSON.stringify(engine)));
  });

  it('/api/transit/:venueId returns per-link loads', async () => {
    const res = await request(app).get('/api/transit/metlife?minute=120&scenario=egress-surge');
    expect(res.status).toBe(200);
    expect(res.body.transit.length).toBeGreaterThanOrEqual(3);
    for (const t of res.body.transit) {
      expect(t.utilizationPct).toBeGreaterThanOrEqual(0);
      expect(t.waitMinutes).toBeGreaterThan(0);
    }
  });

  it('/api/weather/:venueId evaluates presets', async () => {
    const res = await request(app).get(
      '/api/weather/lincoln-philadelphia?preset=philadelphia-lightning&minute=50',
    );
    expect(res.status).toBe(200);
    expect(res.body.protocol.state).toBe('suspension');
    expect(res.body.protocol.actions.fan.join(' ')).toMatch(/shelter/i);
  });

  it('/api/egress/stagger/:venueId returns a stagger plan', async () => {
    const res = await request(app).get('/api/egress/stagger/metlife');
    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBeGreaterThan(0);
  });

  it('/api/incidents/:venueId serves a triage-ordered queue', async () => {
    const res = await request(app).get('/api/incidents/metlife');
    expect(res.status).toBe(200);
    expect(res.body.incidents.length).toBeGreaterThanOrEqual(3);
    // Critical medical outranks the rest (engine ordering).
    expect(res.body.incidents[0].severity).toBe('critical');
  });
});

describe('POST endpoints validate and answer', () => {
  const { app } = testApp();

  it('routing/recommend returns a contiguous, explained route', async () => {
    const res = await request(app).post('/api/routing/recommend').send({
      venueId: 'metlife',
      fromZoneId: 'gate-d',
      toZoneId: 'sec-124',
      profile: 'wheelchair',
    });
    expect(res.status).toBe(200);
    expect(res.body.route.legs.length).toBeGreaterThan(0);
    expect(res.body.route.explanation).toMatch(/\d+% density/);
    for (const leg of res.body.route.legs) expect(leg.stepFree).toBe(true);
  });

  it('egress/advice quantifies the saving', async () => {
    const res = await request(app).post('/api/egress/advice').send({
      venueId: 'metlife',
      mode: 'rail',
    });
    expect(res.status).toBe(200);
    expect(res.body.advice.options).toHaveLength(8);
    expect(res.body.advice.explanation).toMatch(/min/);
  });

  it('entry/assess flags the ghost-ticket case', async () => {
    const res = await request(app).post('/api/entry/assess').send({
      venueId: 'metlife',
      ticketSource: 'third-party',
      transferConfirmed: false,
      idPacked: true,
      bagCompliant: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.readiness.riskLevel).toBe('high');
    expect(res.body.readiness.guidance.join(' ')).toMatch(/ghost ticket/i);
  });

  it('incidents POST creates and queues the report', async () => {
    const res = await request(app).post('/api/incidents').send({
      venueId: 'arrowhead',
      zoneId: 'gate-a',
      category: 'crowd',
      severity: 'high',
      summary: 'Gate A queue spilling into the plaza',
      minute: -30,
    });
    expect(res.status).toBe(201);
    expect(res.body.incident.status).toBe('reported');
    const queue = await request(app).get('/api/incidents/arrowhead');
    expect(queue.body.incidents.some((i: { id: string }) => i.id === res.body.incident.id)).toBe(true);
  });

  it('incident lifecycle advances and terminates', async () => {
    const created = await request(app).post('/api/incidents').send({
      venueId: 'metlife',
      zoneId: 'concourse-n',
      category: 'facility',
      severity: 'low',
      summary: 'Water fountain out of order',
      minute: 10,
    });
    const id = created.body.incident.id as string;
    for (const expected of ['triaged', 'dispatched', 'resolved']) {
      const advanced = await request(app).patch(`/api/incidents/${id}/advance`);
      expect(advanced.status).toBe(200);
      expect(advanced.body.incident.status).toBe(expected);
    }
    const terminal = await request(app).patch(`/api/incidents/${id}/advance`);
    expect(terminal.status).toBe(400);
  });
});

describe('failure classes (M22)', () => {
  const { app } = testApp();

  it.each([
    ['/api/venues/narnia-dome', 404],
    ['/api/crowd/narnia-dome', 404],
    ['/api/transit/narnia-dome', 404],
    ['/api/incidents/narnia-dome', 404],
    ['/api/egress/stagger/narnia-dome', 404],
    ['/api/nope', 404],
  ] as const)('GET %s → %d with the standard envelope', async (path, status) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBeDefined();
    expect(res.body.error.message.length).toBeGreaterThan(5);
  });

  it('unknown venue in a validated body → 400 with field-safe message', async () => {
    const res = await request(app).post('/api/routing/recommend').send({
      venueId: 'narnia-dome',
      fromZoneId: 'a',
      toZoneId: 'b',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('venueId');
    expect(res.body.error.message).not.toContain('narnia-dome'); // no input echo
  });

  it('extra keys are rejected (strict schemas)', async () => {
    const res = await request(app).post('/api/egress/advice').send({
      venueId: 'metlife',
      mode: 'rail',
      hack: true,
    });
    expect(res.status).toBe(400);
  });

  it('malformed JSON → 400 envelope, not a stack trace', async () => {
    const res = await request(app)
      .post('/api/routing/recommend')
      .set('content-type', 'application/json')
      .send('{"venueId": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('oversize body → 413 envelope', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ venueId: 'metlife', summary: 'x'.repeat(40_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('Accept-Language localizes error messages (es)', async () => {
    const res = await request(app).get('/api/venues/narnia-dome').set('accept-language', 'es-MX');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/No pudimos/);
  });
});
