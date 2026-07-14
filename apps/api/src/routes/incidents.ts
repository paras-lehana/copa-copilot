// routes/incidents.ts — incident reporting, queue and lifecycle endpoints.
// Storage is per-instance in-memory (demo scale), seeded on first venue access so
// the ops queue is never empty; the triage ORDER always comes from the engine.

import { Router } from 'express';
import {
  type Incident,
  advanceIncident,
  appError,
  incidentReportSchema,
  seedIncidents,
  simulateVenue,
  triageQueue,
} from '@copa/core';
import { type AppConfig } from '../config';
import { sendError, withBody } from '../middleware/validate';

export function incidentsRouter(config: AppConfig): Router {
  const router = Router();
  const byVenue = new Map<string, Incident[]>();
  let reportCounter = 0;

  function listFor(venueId: string): Incident[] {
    const existing = byVenue.get(venueId);
    if (existing !== undefined) return existing;
    const seeded = [...seedIncidents(venueId, 20)];
    byVenue.set(venueId, seeded);
    return seeded;
  }

  router.post(
    '/api/incidents',
    withBody(incidentReportSchema, (body, _req, res) => {
      reportCounter += 1;
      const incident: Incident = {
        id: `${body.venueId}-rpt-${reportCounter.toString(36)}`,
        venueId: body.venueId,
        zoneId: body.zoneId,
        category: body.category,
        severity: body.severity,
        summary: body.summary,
        status: 'reported',
        reportedAtMinute: body.minute,
      };
      listFor(body.venueId).push(incident);
      res.status(201).json({ incident });
    }),
  );

  router.get('/api/incidents/:venueId', (req, res) => {
    const venueId = req.params.venueId ?? '';
    const snapshot = simulateVenue(venueId, 'normal', 30, config.simSeed);
    if (snapshot === undefined) {
      sendError(req, res, appError('NOT_FOUND'));
      return;
    }
    const queue = triageQueue(listFor(venueId), snapshot);
    res.json({ incidents: queue });
  });

  router.patch('/api/incidents/:incidentId/advance', (req, res) => {
    const incidentId = req.params.incidentId ?? '';
    for (const incidents of byVenue.values()) {
      const index = incidents.findIndex((i) => i.id === incidentId);
      if (index >= 0) {
        const current = incidents[index];
        if (current === undefined) continue;
        const advanced = advanceIncident(current);
        if (!advanced.ok) {
          sendError(req, res, advanced.error);
          return;
        }
        incidents[index] = advanced.value;
        res.json({ incident: advanced.value });
        return;
      }
    }
    sendError(req, res, appError('NOT_FOUND'));
  });

  return router;
}
