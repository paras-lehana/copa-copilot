// routes/venues.ts — venue registry, live crowd snapshots and transit load.
// Read-only surfaces over the deterministic engine; minute/scenario arrive as
// validated query params so judges can replay any moment of any scenario.

import { Router } from 'express';
import {
  VENUES,
  VENUE_IDS,
  appError,
  buildStadiumGraph,
  crowdQuerySchema,
  getVenue,
  simulateVenue,
} from '@copa/core';
import { type AppConfig } from '../config';
import { sendError, withQuery } from '../middleware/validate';

export function venuesRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/api/venues', (_req, res) => {
    res.json({
      venues: VENUE_IDS.map((id) => ({
        id,
        name: VENUES[id].name,
        city: VENUES[id].city,
        country: VENUES[id].country,
        capacity: VENUES[id].capacity,
        climateControlled: VENUES[id].climateControlled,
        flagship: VENUES[id].flagship,
      })),
    });
  });

  router.get('/api/venues/:venueId', (req, res) => {
    const venue = getVenue(req.params.venueId ?? '');
    if (venue === undefined) {
      sendError(req, res, appError('NOT_FOUND'));
      return;
    }
    const graph = buildStadiumGraph(venue.id);
    res.json({ venue, zones: graph?.zones ?? [], edges: graph?.edges ?? [] });
  });

  router.get(
    '/api/crowd/:venueId',
    withQuery(crowdQuerySchema, (query, req, res) => {
      const snapshot = simulateVenue(
        req.params.venueId ?? '',
        query.scenario,
        query.minute,
        config.simSeed,
      );
      if (snapshot === undefined) {
        sendError(req, res, appError('NOT_FOUND'));
        return;
      }
      res.json({ snapshot });
    }),
  );

  router.get(
    '/api/transit/:venueId',
    withQuery(crowdQuerySchema, (query, req, res) => {
      const snapshot = simulateVenue(
        req.params.venueId ?? '',
        query.scenario,
        query.minute,
        config.simSeed,
      );
      if (snapshot === undefined) {
        sendError(req, res, appError('NOT_FOUND'));
        return;
      }
      res.json({ venueId: snapshot.venueId, minute: snapshot.minute, transit: snapshot.transit });
    }),
  );

  return router;
}
