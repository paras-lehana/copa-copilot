// server.ts — buildApp(config): the composed Express application.
// Exported as a factory (no listening socket) so supertest exercises the REAL app.
// Security posture, in order: single-hop trust proxy → security headers → CORS
// allow-list → 32 kb body cap → request logging → general rate limit → routes.

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { appError } from '@copa/core';
import { type AppConfig } from './config';
import { type LogSink, requestLogger, stdoutSink } from './middleware/logger';
import { TokenBucketLimiter, rateLimit } from './middleware/rate-limit';
import { sendError } from './middleware/validate';
import { assistantRouter } from './routes/assistant';
import { engagementRouter } from './routes/engagement';
import { guidanceRouter } from './routes/guidance';
import { incidentsRouter } from './routes/incidents';
import { metaRouter } from './routes/meta';
import { venuesRouter } from './routes/venues';
import { InMemoryUserStore, type UserStore } from './services/store';

/** JSON body cap: the largest legitimate request is far below this. */
export const BODY_LIMIT = '32kb';

/** Build the application. Tests pass frozen clocks and their own sinks/stores. */
export function buildApp(
  config: AppConfig,
  options?: { sink?: LogSink; store?: UserStore },
): Express {
  const app = express();
  const sink = options?.sink ?? stdoutSink;
  const store = options?.store ?? new InMemoryUserStore();

  // Exactly one proxy hop (Cloud Run's front end) — an X-Forwarded-For chain
  // cannot spoof its way out of a rate bucket.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers on every response (the API serves JSON only).
  app.use((_req, res, next) => {
    res.set({
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    });
    next();
  });

  // CORS allow-list from config; non-listed origins get no CORS headers at all.
  app.use((req, res, next) => {
    const origin = req.header('origin');
    if (origin !== undefined && config.allowedOrigins.includes(origin)) {
      res.set({
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
        'access-control-allow-headers': 'content-type,accept-language',
        vary: 'Origin',
      });
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(requestLogger(sink, config.now));

  const generalLimiter = new TokenBucketLimiter('general', config.now);
  app.use(rateLimit(generalLimiter));
  // Efficiency: prune idle rate buckets opportunistically on traffic, no timers.
  app.use((_req, _res, next) => {
    if (Math.abs(config.now().getTime()) % 100 === 0) generalLimiter.prune();
    next();
  });

  app.use(metaRouter(config));
  app.use(venuesRouter(config));
  app.use(guidanceRouter(config));
  app.use(incidentsRouter(config));
  app.use(assistantRouter(config));
  app.use(engagementRouter(store));

  // Unknown routes: same envelope as every other failure.
  app.use((req: Request, res: Response) => {
    sendError(req, res, appError('NOT_FOUND'));
  });

  // Malformed JSON / body-too-large / anything thrown by middleware.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const isTooLarge =
      typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large';
    sendError(req, res, appError(isTooLarge ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_FAILED'));
  });

  return app;
}
