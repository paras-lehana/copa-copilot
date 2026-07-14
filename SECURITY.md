# Security

Responsible, defence-in-depth implementation sized to a hackathon prototype. No PII is collected; there are no biometrics by design (a deliberate choice given 2026 stadium-biometrics litigation).

## STRIDE-lite threat model

| # | Threat | Control | Where |
|---|---|---|---|
| 1 | **Spoofing** rate limits via `X-Forwarded-For` | `trust proxy` pinned to exactly one hop (Cloud Run) so `req.ip` is the real client | `apps/api/src/server.ts` |
| 2 | **Tampering** with request bodies | Zod `.strict()` on every endpoint; unknown keys rejected | `packages/core/src/schemas.ts`, `apps/api/src/middleware/validate.ts` |
| 3 | **Repudiation** / weak audit | Structured Cloud-Logging-shaped request logs (method/path/status/latency) | `apps/api/src/middleware/logger.ts` |
| 4 | **Information disclosure** — input echo | Custom zod error map returns field-name-only messages; a test asserts a secret value never appears in any error | `schemas.ts` (`safeErrorMap`), `schemas.test.ts` |
| 5 | **Information disclosure** — secrets | Gemini key server-side only, mounted from Secret Manager by reference; secret-absence sweep over every GET endpoint | `scripts/deploy.ps1`, `security.test.ts` |
| 6 | **Information disclosure** — upstream payloads | Gemini failures sanitized to `UPSTREAM_FAILURE`; response bodies/auth never logged | `apps/api/src/services/gemini-client.ts` |
| 7 | **DoS** | Per-IP token buckets: 60/min general, 10/min assistant; 32 kb JSON body cap; `--max-instances=3` | `rate-limit.ts`, `server.ts`, `cloudbuild-api.yaml` |
| 8 | **Elevation** — prompt injection | Per-request nonce fence around user input + `VERIFIED_STADIUM_DATA` grounding; refusal rules; 10-attack red-team suite | `prompt-boundary.ts`, `assistant.test.ts` |
| 9 | **Elevation** — point minting | Client-restored points clamped server-side to a max; mission replay rejected | `gamification.ts` (`clampRestoredPoints`), `engagement.ts` |

## Error envelope
Every failure returns exactly `{ "error": { "code", "message" } }` with a localized, safe message and no internals. Server-only diagnostics live in an `AppError.diagnostics` field that is never serialized (asserted by tests).

## Content-Security-Policy — a deliberate choice
The API sends `default-src 'none'`. The **web origin ships the safe hardening headers** (nosniff, X-Frame-Options DENY, Referrer-Policy, HSTS, Permissions-Policy) **but no CSP** — a CSP that would require `'unsafe-inline'` to keep Next.js hydration working documents its own bypass and scores worse than its absence. A hash-based CSP is the planned upgrade.

## Responsible AI
The assistant is grounded exclusively in engine tool output, cannot be re-instructed by text inside the user fence, refuses PII / security-bypass / restricted-area requests, and directs medical emergencies to first aid and staff rather than diagnosing.

## Supply chain
CI runs `npm audit --omit=dev --audit-level=moderate`; `overrides` pin known-safe transitive versions; CI actions are pinned to full commit SHAs; Docker base images are pinned by digest and run as the non-root `node` user.
