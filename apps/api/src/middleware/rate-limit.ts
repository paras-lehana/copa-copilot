// rate-limit.ts — per-IP token buckets with named tiers.
// Security: `trust proxy` is pinned to exactly one hop (Cloud Run's load balancer)
// in server.ts, so req.ip is the real client — an X-Forwarded-For spoof cannot
// escape its bucket. Buckets refill continuously and prune idle entries.

import { type NextFunction, type Request, type Response } from 'express';
import { appError, httpStatusFor, safeMessageFor } from '@copa/core';

/** Bucket tiers: capacity per minute. The assistant tier is stricter (Gemini spend). */
export const RATE_TIERS = {
  general: { capacityPerMinute: 60 },
  assistant: { capacityPerMinute: 10 },
} as const;

/** A tier name. */
export type RateTier = keyof typeof RATE_TIERS;

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

/** One limiter instance per tier; state is per-process (Cloud Run instance). */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;

  constructor(
    tier: RateTier,
    private readonly now: () => Date,
  ) {
    this.capacity = RATE_TIERS[tier].capacityPerMinute;
  }

  /** Take one token; false = over the limit. Refills continuously. */
  take(key: string): boolean {
    const nowMs = this.now().getTime();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, lastRefillMs: nowMs };
    const elapsedMinutes = (nowMs - bucket.lastRefillMs) / 60_000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedMinutes * this.capacity);
    bucket.lastRefillMs = nowMs;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }

  /** Drop buckets idle for over 10 minutes — bounds memory on long-lived instances. */
  prune(): number {
    const cutoff = this.now().getTime() - 10 * 60_000;
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefillMs < cutoff) {
        this.buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Current bucket count (for tests). */
  size(): number {
    return this.buckets.size;
  }
}

/** Express middleware for a limiter. 429s carry the standard error envelope. */
export function rateLimit(limiter: TokenBucketLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (limiter.take(req.ip ?? 'unknown')) {
      next();
      return;
    }
    const error = appError('RATE_LIMITED');
    res
      .status(httpStatusFor(error.code))
      .set('Retry-After', '30')
      .json({ error: { code: error.code, message: safeMessageFor(error.code) } });
  };
}
