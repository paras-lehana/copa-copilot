// corner-cases.test.ts — boundary and adversarial inputs at the API edge: minute
// bounds, enum rejection, scope/venue combinations, concurrency, and idempotent reads.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testApp } from './helpers';

describe('minute bounds on query endpoints', () => {
  const { app } = testApp();

  it.each([-240, 240, 0])('accepts in-range minute %d', async (minute) => {
    const res = await request(app).get(`/api/crowd/metlife?minute=${minute}`);
    expect(res.status).toBe(200);
  });

  it.each([241, -241, 9999])('rejects out-of-range minute %d with 400', async (minute) => {
    const res = await request(app).get(`/api/crowd/metlife?minute=${minute}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a non-numeric minute', async () => {
    const res = await request(app).get('/api/crowd/metlife?minute=soon');
    expect(res.status).toBe(400);
  });
});

describe('enum rejection at the API edge', () => {
  const { app } = testApp();

  it('rejects an unknown assistant persona', async () => {
    const res = await request(app)
      .post('/api/assistant/query')
      .send({ message: 'hi', venueId: 'metlife', persona: 'referee' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown scenario', async () => {
    const res = await request(app).get('/api/crowd/metlife?scenario=apocalypse');
    expect(res.status).toBe(400);
  });

  it('rejects an unknown egress mode', async () => {
    const res = await request(app).post('/api/egress/advice').send({ venueId: 'metlife', mode: 'teleport' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown weather preset', async () => {
    const res = await request(app).get('/api/weather/metlife?preset=blizzard');
    expect(res.status).toBe(400);
  });
});

describe('leaderboard scope/venue combinations', () => {
  const { app } = testApp();

  it('venue scope without a venueId still responds (tournament-wide fallback semantics)', async () => {
    const res = await request(app).get('/api/leaderboard?scope=venue');
    expect(res.status).toBe(200);
    expect(res.body.page).toBeDefined();
  });

  it('rejects a markup-bearing sectionZoneId', async () => {
    const res = await request(app).get('/api/leaderboard?scope=section&venueId=metlife&sectionZoneId=%3Cb%3E');
    expect(res.status).toBe(400);
  });

  it('empty board returns zero entries, not an error', async () => {
    const res = await request(app).get('/api/leaderboard?scope=tournament');
    expect(res.status).toBe(200);
    expect(res.body.page.totalEntries).toBe(0);
    expect(res.body.page.top).toEqual([]);
  });
});

describe('mission completion edge cases', () => {
  const { app } = testApp();

  it('rejects completion for an unknown user (404)', async () => {
    const res = await request(app)
      .post('/api/missions/complete')
      .send({ userId: 'ghost', missionId: 'route-follow', minute: 30 });
    expect(res.status).toBe(404);
  });

  it('rejects an unknown missionId (400 schema)', async () => {
    const boot = await request(app)
      .post('/api/users/bootstrap')
      .send({ displayName: 'Edge', venueId: 'metlife', sectionZoneId: 'sec-111' });
    const res = await request(app)
      .post('/api/missions/complete')
      .send({ userId: boot.body.profile.userId, missionId: 'win-the-cup', minute: 30 });
    expect(res.status).toBe(400);
  });
});

describe('idempotency & concurrency', () => {
  it('repeated identical crowd reads are byte-identical (deterministic engine)', async () => {
    const { app } = testApp();
    const a = await request(app).get('/api/crowd/metlife?scenario=egress-surge&minute=120');
    const b = await request(app).get('/api/crowd/metlife?scenario=egress-surge&minute=120');
    expect(a.body).toEqual(b.body);
  });

  it('handles a burst of concurrent bootstraps with unique ids', async () => {
    const { app } = testApp();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        request(app)
          .post('/api/users/bootstrap')
          .send({ displayName: `Fan${i}`, venueId: 'metlife', sectionZoneId: 'sec-111' }),
      ),
    );
    const ids = results.map((r) => r.body.profile.userId as string);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of results) expect(r.status).toBe(201);
  });
});

describe('case-insensitive venue is NOT silently accepted (strict ids)', () => {
  const { app } = testApp();
  it('rejects a wrong-case venue id', async () => {
    const res = await request(app).get('/api/crowd/MetLife');
    expect(res.status).toBe(404);
  });
});
