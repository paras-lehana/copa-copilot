// routes/engagement.ts — anonymous profiles, mission completion, leaderboards.
// Anti-minting: bootstrap clamps client-claimed points; awards come exclusively
// from the gamification engine's validated completions.

import { Router } from 'express';
import {
  MISSIONS,
  MISSION_IDS,
  appError,
  bootstrapSchema,
  buildLeaderboard,
  commuteFootprint,
  greenestSections,
  leaderboardQuerySchema,
  missionClaimSchema,
  validateCompletion,
} from '@copa/core';
import { type UserStore, createProfile, profileView } from '../services/store';
import { sendError, withBody, withQuery } from '../middleware/validate';

export function engagementRouter(store: UserStore): Router {
  const router = Router();

  router.post(
    '/api/users/bootstrap',
    withBody(bootstrapSchema, async (body, _req, res) => {
      const profile = createProfile(
        body.displayName,
        body.venueId,
        body.sectionZoneId,
        body.claimedPoints,
      );
      await store.upsertUser(profile);
      res.status(201).json({ profile: profileView(profile) });
    }),
  );

  router.get('/api/users/:userId', async (req, res) => {
    const profile = await store.getUser(req.params.userId ?? '');
    if (profile === undefined) {
      sendError(req, res, appError('NOT_FOUND'));
      return;
    }
    res.json({ profile: profileView(profile) });
  });

  router.get('/api/missions', (_req, res) => {
    res.json({ missions: MISSION_IDS.map((id) => MISSIONS[id]) });
  });

  router.post(
    '/api/missions/complete',
    withBody(missionClaimSchema, async (body, req, res) => {
      const profile = await store.getUser(body.userId);
      if (profile === undefined) {
        sendError(req, res, appError('NOT_FOUND'));
        return;
      }
      if (profile.completedMissions.includes(body.missionId)) {
        sendError(req, res, appError('MISSION_REJECTED', 'mission already completed (replay)'));
        return;
      }
      const award = validateCompletion({
        missionId: body.missionId,
        minute: body.minute,
        commuteMode: body.commuteMode,
        commuteDistanceKm: body.commuteDistanceKm,
        advisedLeaveMinute: body.advisedLeaveMinute,
        heatProtocolActive: body.heatProtocolActive,
        // Server-derived arrival window keeps the claim honest for beat-the-rush.
        arrivalWindow: { fromMinute: -120, toMinute: -75 },
      });
      if (!award.ok) {
        sendError(req, res, award.error);
        return;
      }
      const kgSaved =
        body.commuteMode !== undefined && body.commuteDistanceKm !== undefined
          ? commuteFootprint(body.commuteMode, body.commuteDistanceKm).kgCo2eSavedVsRideshare
          : 0;
      const updated = {
        ...profile,
        points: profile.points + award.value.points,
        kgCo2eSaved: Math.round((profile.kgCo2eSaved + kgSaved) * 100) / 100,
        completedMissions: [...profile.completedMissions, body.missionId],
      };
      await store.upsertUser(updated);
      res.json({ award: award.value, profile: profileView(updated) });
    }),
  );

  router.get(
    '/api/leaderboard',
    withQuery(leaderboardQuerySchema, async (query, _req, res) => {
      const entries = await store.listLeaderboardEntries(10_000);
      const page = buildLeaderboard(
        entries,
        query.scope,
        { venueId: query.venueId, sectionZoneId: query.sectionZoneId },
        query.userId,
        10,
        1,
      );
      const greenest =
        query.venueId === undefined ? [] : greenestSections(entries, query.venueId);
      res.json({ page, greenestSections: greenest });
    }),
  );

  return router;
}
