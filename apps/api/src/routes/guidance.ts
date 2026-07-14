// routes/guidance.ts — routing, egress, weather and entry-readiness endpoints.
// Each is a thin, validated shell over one engine call: schemas own the input
// contract, engines own the numbers, this file owns neither.

import { Router } from 'express';
import {
  adviseEgress,
  appError,
  assessEntryReadiness,
  egressRequestSchema,
  entryFactsSchema,
  evaluateWeatherProtocol,
  planStaggeredEgress,
  recommendRoute,
  routingRequestSchema,
  weatherQuerySchema,
} from '@copa/core';
import { type AppConfig } from '../config';
import { sendError, withBody, withQuery } from '../middleware/validate';

export function guidanceRouter(config: AppConfig): Router {
  const router = Router();

  router.post(
    '/api/routing/recommend',
    withBody(routingRequestSchema, (body, req, res) => {
      const route = recommendRoute(
        body.venueId,
        body.fromZoneId,
        body.toZoneId,
        body.profile,
        body.scenario,
        body.minute,
        config.simSeed,
      );
      if (!route.ok) {
        sendError(req, res, route.error);
        return;
      }
      res.json({ route: route.value });
    }),
  );

  router.post(
    '/api/egress/advice',
    withBody(egressRequestSchema, (body, req, res) => {
      const advice = adviseEgress(body.venueId, body.mode, body.scenario, config.simSeed);
      if (!advice.ok) {
        sendError(req, res, advice.error);
        return;
      }
      res.json({ advice: advice.value });
    }),
  );

  router.get('/api/egress/stagger/:venueId', (req, res) => {
    const plan = planStaggeredEgress(req.params.venueId ?? '', config.simSeed);
    if (!plan.ok) {
      sendError(req, res, plan.error);
      return;
    }
    res.json({ slots: plan.value });
  });

  router.get(
    '/api/weather/:venueId',
    withQuery(weatherQuerySchema, (query, req, res) => {
      const protocol = evaluateWeatherProtocol(
        req.params.venueId ?? '',
        query.preset,
        query.minute,
        config.simSeed,
      );
      if (protocol === undefined) {
        sendError(req, res, appError('NOT_FOUND'));
        return;
      }
      res.json({ protocol });
    }),
  );

  router.post(
    '/api/entry/assess',
    withBody(entryFactsSchema, (body, req, res) => {
      const readiness = assessEntryReadiness(
        body.venueId,
        {
          ticketSource: body.ticketSource,
          transferConfirmed: body.transferConfirmed,
          idPacked: body.idPacked,
          bagCompliant: body.bagCompliant,
        },
        config.simSeed,
      );
      if (readiness === undefined) {
        sendError(req, res, appError('NOT_FOUND'));
        return;
      }
      res.json({ readiness });
    }),
  );

  return router;
}
