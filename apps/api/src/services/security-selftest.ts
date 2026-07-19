// security-selftest.ts — a startup self-audit of the runtime security posture.
// Rationale: the most damaging security failures in a small service are not code
// bugs but MISCONFIGURATIONS — a wildcard CORS origin, a plaintext upstream, a
// build that claims "live AI" while silently running the demo path. Those never
// show up in a unit test of a handler; they show up only when the assembled config
// is inspected as a whole. This module does exactly that: it takes the fully-loaded
// AppConfig and returns a list of findings. main.ts logs them and, in production,
// refuses to start on any CRITICAL finding (fail-closed) — while WARNINGS (e.g. the
// graceful "no key ⇒ demo" degradation) are surfaced but allowed. Pure + total:
// no I/O, no throw, so every branch is unit-tested in security.test.ts.

import { type AppConfig } from '../config';
import { isAllowedLlmUrl } from './llm-client';

/** Critical findings block startup in production; warnings are advisory only. */
export type SecuritySeverity = 'critical' | 'warning';

/** One posture problem discovered by the self-test. */
export interface SecurityFinding {
  /** Stable machine-readable id (asserted by tests, greppable in logs). */
  readonly id: string;
  readonly severity: SecuritySeverity;
  /** Operator-facing explanation — never contains a secret VALUE. */
  readonly message: string;
}

/** A CORS origin that is safe in production: https, or an explicit localhost dev origin. */
function isSecureOrigin(origin: string): boolean {
  return origin.startsWith('https://') || origin.startsWith('http://localhost');
}

/**
 * Audit the assembled runtime configuration. Returns findings sorted CRITICAL first.
 *
 * Checks (in order of severity):
 *  - `cors-wildcard`      — an allow-list entry of `*` would let any site call the API.
 *  - `cors-insecure`      — a non-https, non-localhost origin leaks requests in cleartext.
 *  - `llm-upstream-unsafe`— the key-bearing upstream is not an allow-listed HTTPS host (SSRF/exfil).
 *  - `live-without-key`   — prod claims live mode but has no key, so it silently serves demo.
 *  - `demo-in-production` — prod is running the deterministic demo path (informational).
 *
 * @example
 * const findings = runSecuritySelfTest(config, { isProduction: true });
 * if (findings.some((f) => f.severity === 'critical')) process.exit(1);
 */
export function runSecuritySelfTest(
  config: AppConfig,
  opts: { isProduction: boolean },
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (config.allowedOrigins.includes('*')) {
    findings.push({
      id: 'cors-wildcard',
      severity: 'critical',
      message: 'CORS allow-list contains "*" — refuse to serve credentials to any origin.',
    });
  }

  if (opts.isProduction) {
    const insecure = config.allowedOrigins.filter((o) => !isSecureOrigin(o));
    if (insecure.length > 0) {
      findings.push({
        id: 'cors-insecure',
        severity: 'critical',
        message: `CORS allow-list has ${insecure.length} non-HTTPS origin(s) in production.`,
      });
    }
  }

  if (!isAllowedLlmUrl(config.llmServiceUrl)) {
    findings.push({
      id: 'llm-upstream-unsafe',
      severity: 'critical',
      message: 'llm-service URL is not an allow-listed HTTPS host — key would travel unsafely.',
    });
  }

  if (opts.isProduction && !config.demoMode && config.llmInternalKey.length === 0) {
    findings.push({
      id: 'live-without-key',
      severity: 'warning',
      message: 'Live mode is on but no llm-service key is set — the assistant will serve the demo path.',
    });
  }

  if (opts.isProduction && config.demoMode) {
    findings.push({
      id: 'demo-in-production',
      severity: 'warning',
      message: 'Production is running the deterministic demo path (DEMO_MODE=true).',
    });
  }

  // Critical first so a scanning operator (or a fail-closed guard) sees blockers up top.
  return findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
}

/** True when any finding would block a fail-closed production startup. */
export function hasCriticalFinding(findings: readonly SecurityFinding[]): boolean {
  return findings.some((f) => f.severity === 'critical');
}
