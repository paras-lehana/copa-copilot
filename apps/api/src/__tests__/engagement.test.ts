// engagement.test.ts — profiles, anti-minting, mission flow, leaderboard pages,
// replay protection, and gemini-client fallback via the injectable fetch seam.
import { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { generateContent } from '../services/gemini-client';
import { testApp } from './helpers';

describe('user bootstrap & anti-minting', () => {
  it('creates an anonymous profile (no PII fields exist at all)', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/users/bootstrap').send({
      displayName: 'Fan One',
      venueId: 'metlife',
      sectionZoneId: 'sec-111',
    });
    expect(res.status).toBe(201);
    expect(res.body.profile.userId).toMatch(/^fan-/);
    expect(res.body.profile.points).toBe(0);
    expect(res.body.profile.level).toBe(1);
    expect(Object.keys(res.body.profile).sort()).toEqual(
      ['completedMissions', 'displayName', 'kgCo2eSaved', 'level', 'points', 'sectionZoneId', 'userId', 'venueId'].sort(),
    );
  });

  it('clamps client-claimed restore points (anti-minting)', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/users/bootstrap').send({
      displayName: 'Minter',
      venueId: 'metlife',
      sectionZoneId: 'sec-111',
      claimedPoints: 999_999,
    });
    expect(res.status).toBe(201);
    expect(res.body.profile.points).toBe(2000); // MAX_RESTORABLE_POINTS
  });

  it('rejects markup in display names', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/users/bootstrap').send({
      displayName: '<img onerror=x>',
      venueId: 'metlife',
      sectionZoneId: 'sec-111',
    });
    expect(res.status).toBe(400);
  });

  it('unknown user lookups 404', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/users/ghost');
    expect(res.status).toBe(404);
  });
});

describe('mission completion flow', () => {
  async function bootstrap(app: Express): Promise<string> {
    const res = await request(app).post('/api/users/bootstrap').send({
      displayName: 'Runner',
      venueId: 'metlife',
      sectionZoneId: 'sec-111',
    });
    return res.body.profile.userId as string;
  }

  it('green-footprint awards engine-computed points and accumulates CO2e', async () => {
    const { app } = testApp();
    const userId = await bootstrap(app);
    const res = await request(app).post('/api/missions/complete').send({
      userId,
      missionId: 'green-footprint',
      minute: -60,
      commuteMode: 'rail',
      commuteDistanceKm: 15,
    });
    expect(res.status).toBe(200);
    // 30 base + pointsForCo2(2.13 saved) = 30 + 21 = 51 — engine math, not fixture math.
    expect(res.body.award.points).toBe(51);
    expect(res.body.profile.kgCo2eSaved).toBe(2.13);
    expect(res.body.profile.completedMissions).toContain('green-footprint');
  });

  it('replayed missions are rejected (already completed)', async () => {
    const { app } = testApp();
    const userId = await bootstrap(app);
    const claim = { userId, missionId: 'route-follow', minute: 30 };
    const first = await request(app).post('/api/missions/complete').send(claim);
    expect(first.status).toBe(200);
    const replay = await request(app).post('/api/missions/complete').send(claim);
    expect(replay.status).toBe(422);
  });

  it('invalid claims are rejected with MISSION_REJECTED', async () => {
    const { app } = testApp();
    const userId = await bootstrap(app);
    const res = await request(app).post('/api/missions/complete').send({
      userId,
      missionId: 'green-footprint',
      minute: -60,
      commuteMode: 'rideshare',
      commuteDistanceKm: 10,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MISSION_REJECTED');
  });

  it('missions catalog lists the five operational missions', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/missions');
    expect(res.body.missions).toHaveLength(5);
  });
});

describe('leaderboard endpoint', () => {
  it('ranks bootstrapped users and returns greenest sections for a venue', async () => {
    const { app } = testApp();
    const users: string[] = [];
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      const res = await request(app).post('/api/users/bootstrap').send({
        displayName: name,
        venueId: 'metlife',
        sectionZoneId: name === 'Gamma' ? 'sec-124' : 'sec-111',
      });
      users.push(res.body.profile.userId as string);
    }
    // Give Beta a mission so ranks differ.
    await request(app).post('/api/missions/complete').send({
      userId: users[1],
      missionId: 'green-footprint',
      minute: -60,
      commuteMode: 'rail',
      commuteDistanceKm: 20,
    });
    const res = await request(app).get('/api/leaderboard?scope=venue&venueId=metlife');
    expect(res.status).toBe(200);
    expect(res.body.page.top[0].displayName).toBe('Beta');
    expect(res.body.page.totalEntries).toBe(3);
    expect(res.body.greenestSections[0].sectionZoneId).toBe('sec-111');
  });

  it('around-me includes the requesting user', async () => {
    const { app } = testApp();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/users/bootstrap').send({
        displayName: `Fan ${i}`,
        venueId: 'metlife',
        sectionZoneId: 'sec-111',
        claimedPoints: i * 100,
      });
      ids.push(res.body.profile.userId as string);
    }
    const res = await request(app).get(`/api/leaderboard?scope=venue&venueId=metlife&userId=${ids[0]}`);
    expect(res.body.page.aroundMe.some((e: { userId: string }) => e.userId === ids[0])).toBe(true);
  });
});

describe('gemini-client seam (M28 fallback contract)', () => {
  const options = { apiKey: 'k', model: 'gemini-2.5-flash' };

  it('sends the key as a header, never in the URL', async () => {
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    await generateContent(
      {
        ...options,
        fetchFn: async (url, init) => {
          seenUrl = url;
          seenHeaders = Object.fromEntries(
            Object.entries((init.headers ?? {}) as Record<string, string>),
          );
          return new Response(
            JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
            { status: 200 },
          );
        },
      },
      'system',
      'user',
    );
    expect(seenUrl).not.toContain('k=');
    expect(seenUrl).not.toContain('key=');
    expect(seenHeaders['x-goog-api-key']).toBe('k');
  });

  it('parses a good reply', async () => {
    const r = await generateContent(
      {
        ...options,
        fetchFn: async () =>
          new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] }), {
            status: 200,
          }),
      },
      's',
      'u',
    );
    expect(r.ok && r.value.text).toBe('hello');
  });

  it.each([400, 401, 429, 500])('sanitizes upstream %d to UPSTREAM_FAILURE', async (status) => {
    const r = await generateContent(
      {
        ...options,
        fetchFn: async () => new Response('{"error": {"details": "SENSITIVE UPSTREAM BODY"}}', { status }),
      },
      's',
      'u',
    );
    expect(!r.ok && r.error.code).toBe('UPSTREAM_FAILURE');
    expect(!r.ok && r.error.diagnostics).not.toContain('SENSITIVE');
  });

  it('maps network failure and empty candidates to UPSTREAM_FAILURE', async () => {
    const network = await generateContent(
      { ...options, fetchFn: async () => Promise.reject(new Error('boom')) },
      's',
      'u',
    );
    expect(!network.ok && network.error.code).toBe('UPSTREAM_FAILURE');
    const empty = await generateContent(
      { ...options, fetchFn: async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }) },
      's',
      'u',
    );
    expect(!empty.ok && empty.error.code).toBe('UPSTREAM_FAILURE');
  });

  it('live mode degrades to the demo reply when upstream fails (endpoint-level)', async () => {
    const { app } = testApp({ DEMO_MODE: 'false', GEMINI_API_KEY: 'not-a-real-key' });
    const res = await request(app).post('/api/assistant/query').send({
      message: 'How crowded is it?',
      venueId: 'metlife',
    });
    // The fake key fails upstream; the reply must still be a grounded demo answer.
    expect(res.status).toBe(200);
    expect(res.body.reply.engine).toBe('demo');
    expect(res.body.reply.toolTraces).toHaveLength(1);
  }, 30_000);
});
