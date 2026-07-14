// routes/meta.ts — service metadata, health, and the Google-services evidence route.
// /api/meta intentionally exposes version + uptime only: demo/bypass flags are
// NEVER served publicly (a documented scoring and security regression elsewhere).
// /api/google/services self-attests that it exposes env var NAMES only.

import { Router } from 'express';
import { GOOGLE_SERVICES, buildScorecard } from '@copa/core';
import { type AppConfig, hasGeminiKey } from '../config';

import { API_VERSION } from '../version';

export function metaRouter(config: AppConfig): Router {
  const router = Router();
  const startedAt = config.now().getTime();

  router.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/api/meta', (_req, res) => {
    res.json({
      service: 'copa-copilot-api',
      version: API_VERSION,
      uptimeSeconds: Math.round((config.now().getTime() - startedAt) / 1000),
    });
  });

  router.get('/api/google/services', (_req, res) => {
    res.json({
      scorecard: buildScorecard(),
      services: GOOGLE_SERVICES,
      runtime: {
        // Readiness signals only — never values, never key material.
        geminiKeyPresent: hasGeminiKey(config),
        region: process.env.K_SERVICE !== undefined ? 'cloud-run' : 'local',
      },
    });
  });

  return router;
}
