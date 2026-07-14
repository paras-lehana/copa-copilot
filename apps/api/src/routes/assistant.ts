// routes/assistant.ts — the assistant query and ops-briefing endpoints.
// The assistant route sits behind the stricter rate tier (Gemini spend control);
// both endpoints degrade to deterministic engine output on any upstream failure.

import { Router } from 'express';
import { assistantQuerySchema, briefingRequestSchema } from '@copa/core';
import { type AppConfig } from '../config';
import { answerQuery } from '../services/assistant';
import { produceBriefing } from '../services/briefing';
import { withBody } from '../middleware/validate';
import { TokenBucketLimiter, rateLimit } from '../middleware/rate-limit';

export function assistantRouter(config: AppConfig): Router {
  const router = Router();
  const assistantLimiter = new TokenBucketLimiter('assistant', config.now);

  router.post(
    '/api/assistant/query',
    rateLimit(assistantLimiter),
    withBody(assistantQuerySchema, async (body, _req, res) => {
      const reply = await answerQuery(body, config);
      res.json({ reply });
    }),
  );

  router.post(
    '/api/ops/briefing',
    rateLimit(assistantLimiter),
    withBody(briefingRequestSchema, async (body, _req, res) => {
      const briefing = await produceBriefing(body, config);
      if (briefing === undefined) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown venue.' } });
        return;
      }
      res.json({ briefing });
    }),
  );

  return router;
}
