// validate.ts — zod-driven request validation with a typed handler wrapper.
// The generic ties the schema's inferred type to the handler signature, so there is
// no `as T` cast anywhere: the compiler carries the proof from schema to handler.
// Failures return the single safe envelope; raw input never echoes (safeErrorMap).

import { type Request, type RequestHandler, type Response } from 'express';
import { type ZodSchema, type z } from 'zod';
import {
  type AppError,
  appError,
  httpStatusFor,
  resolveLanguage,
  safeErrorMap,
  safeMessageFor,
} from '@copa/core';

/** The one error envelope every failure uses. */
export function sendError(req: Request, res: Response, error: AppError): void {
  const language = resolveLanguage(req.header('accept-language')?.split(',')[0]);
  res.status(httpStatusFor(error.code)).json({
    error: { code: error.code, message: safeMessageFor(error.code, language) },
  });
}

/**
 * Wrap a handler with body validation: the handler receives the PARSED, TYPED body.
 * Validation failures answer 400 with field-level safe messages.
 */
export function withBody<S extends ZodSchema>(
  schema: S,
  handler: (body: z.infer<S>, req: Request, res: Response) => void | Promise<void>,
): RequestHandler {
  return async (req, res) => {
    const parsed = schema.safeParse(req.body, { errorMap: safeErrorMap });
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => i.message).join(' ');
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: detail } });
      return;
    }
    try {
      await handler(parsed.data, req, res);
    } catch {
      // Unknown throw = internal; diagnostics stay server-side by construction.
      sendError(req, res, appError('INTERNAL'));
    }
  };
}

/**
 * Wrap a handler with query validation (same contract as withBody, for GETs).
 */
export function withQuery<S extends ZodSchema>(
  schema: S,
  handler: (query: z.infer<S>, req: Request, res: Response) => void | Promise<void>,
): RequestHandler {
  return async (req, res) => {
    const parsed = schema.safeParse(coerceQuery(req.query), { errorMap: safeErrorMap });
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => i.message).join(' ');
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: detail } });
      return;
    }
    try {
      await handler(parsed.data, req, res);
    } catch {
      sendError(req, res, appError('INTERNAL'));
    }
  };
}

/** Query strings arrive as strings; coerce numerics so zod int schemas accept them. */
function coerceQuery(query: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) {
      out[key] = Number(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
