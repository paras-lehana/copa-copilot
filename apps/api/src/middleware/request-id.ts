// request-id.ts — attach a correlation id to every request and echo it back.
// Security/observability: a stable per-request id ties a client report to server
// logs without logging any user content, and lets a caller reference a failed
// request. The id is derived from a seeded counter + the injected clock (no
// Math.random, so it stays deterministic under test).

import { type NextFunction, type Request, type Response } from 'express';

/** Requests carry their correlation id so handlers/loggers can read it. */
export interface WithRequestId extends Request {
  requestId?: string;
}

let counter = 0;

/**
 * Middleware that assigns `req.requestId` and sets the `X-Request-Id` response
 * header. Honors an inbound `X-Request-Id` when it is a safe, bounded token.
 */
export function requestId(now: () => Date) {
  return (req: WithRequestId, res: Response, next: NextFunction): void => {
    const inbound = req.header('x-request-id');
    const id =
      inbound !== undefined && /^[A-Za-z0-9-]{1,64}$/.test(inbound)
        ? inbound
        : `req-${now().getTime().toString(36)}-${(counter += 1).toString(36)}`;
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}
