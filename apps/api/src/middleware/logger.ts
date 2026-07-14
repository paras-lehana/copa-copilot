// logger.ts — structured, Cloud-Logging-shaped request/error logging.
// Redaction contract (tested): log lines never contain user free-text, upstream
// (Gemini) response bodies, or environment values — method/path/status/latency only.
// There is no console.log anywhere in this codebase; this sink is the one voice.

import { type NextFunction, type Request, type Response } from 'express';

/** Log severities matching Cloud Logging. */
export type LogSeverity = 'INFO' | 'WARNING' | 'ERROR';

/** A structured log line. */
export interface LogLine {
  readonly severity: LogSeverity;
  readonly message: string;
  readonly httpRequest?: {
    readonly requestMethod: string;
    readonly requestUrl: string;
    readonly status: number;
    readonly latencyMs: number;
  };
  readonly timestamp: string;
}

/** Where log lines go — injectable for tests, stdout JSON in production. */
export type LogSink = (line: LogLine) => void;

/** Default sink: one JSON object per line (Cloud Logging structured format). */
export const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${JSON.stringify(line)}\n`);
};

/**
 * Request-logging middleware. Logs ONLY method, path (no query string — query
 * values are user input), status and latency.
 */
export function requestLogger(sink: LogSink, now: () => Date) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = now().getTime();
    res.on('finish', () => {
      sink({
        severity: res.statusCode >= 500 ? 'ERROR' : 'INFO',
        message: `${req.method} ${req.path} ${res.statusCode}`,
        httpRequest: {
          requestMethod: req.method,
          requestUrl: req.path,
          status: res.statusCode,
          latencyMs: now().getTime() - startedAt,
        },
        timestamp: now().toISOString(),
      });
    });
    next();
  };
}

/**
 * Operational event logger for non-request events (startup, upstream failures).
 * Callers pass short static messages — never payloads.
 */
export function logEvent(sink: LogSink, now: () => Date, severity: LogSeverity, message: string): void {
  sink({ severity, message, timestamp: now().toISOString() });
}
