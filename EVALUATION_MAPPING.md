# Evaluation Mapping — Rubric ↔ Code

> A one-page cheatsheet mapping every PromptWars rubric axis to the exact files, tests and docs that satisfy it. Jump straight to proof.

## Code Quality
| Evidence in code | Tests | Docs |
|---|---|---|
| TypeScript strict + `noUncheckedIndexedAccess` ([tsconfig.base.json](tsconfig.base.json)); `Result<T,AppError>` ([packages/core/src/result.ts](packages/core/src/result.ts), [errors.ts](packages/core/src/errors.ts)); one zod source ([schemas.ts](packages/core/src/schemas.ts)); ESLint over every workspace ([eslint.config.mjs](eslint.config.mjs)); grep-census script ([scripts/grep-census.ps1](scripts/grep-census.ps1)); OpenAPI 3.1 contract ([openapi.yaml](openapi.yaml)); LICENSE + CONTRIBUTING | `result.test.ts`, `errors.test.ts`, `schemas.test.ts`, `boundaries.test.ts` | README "Code quality"; this file |
| No duplicated logic (web imports core schemas & types); constants-as-data (`Record<Union,Config>`) throughout the engine | schema invariant tests | ARCHITECTURE.md |

## Security
| Evidence in code | Tests | Docs |
|---|---|---|
| Zod `.strict()` + safe error map, no raw-input echo ([schemas.ts](packages/core/src/schemas.ts), [validate.ts](apps/api/src/middleware/validate.ts)); token buckets ([rate-limit.ts](apps/api/src/middleware/rate-limit.ts)); prompt-injection nonce boundary ([prompt-boundary.ts](apps/api/src/services/prompt-boundary.ts)); PII-safe logs ([logger.ts](apps/api/src/middleware/logger.ts)); Secret Manager by reference ([scripts/deploy.ps1](scripts/deploy.ps1)); security headers, no `unsafe-inline` CSP ([server.ts](apps/api/src/server.ts), [next.config.ts](apps/web/next.config.ts)) | `security.test.ts` (rate limits, headers, secret-absence, log redaction), `assistant.test.ts` (10-prompt injection red team) | SECURITY.md |

## Efficiency
| Evidence in code | Tests | Docs |
|---|---|---|
| Zero-runtime-dep core (zod only); deterministic fallbacks (no network retries); briefing TTL cache ([briefing.ts](apps/api/src/services/briefing.ts)); reply budgets + input caps; `--max-instances=3` scale-to-zero ([cloudbuild-api.yaml](cloudbuild-api.yaml)); `// Efficiency:` annotations in place | briefing cache hit/miss tests; routing perf guard (<5ms/route) | ARCHITECTURE.md efficiency table |

## Testing
| Evidence in code | Tests | Docs |
|---|---|---|
| 5 layers: core unit ([packages/core/src/*.test.ts](packages/core/src)), API integration ([apps/api/src/__tests__](apps/api/src/__tests__)), web component ([apps/web](apps/web)), e2e + axe ([e2e/](e2e)); coverage gated in CI | **~1,470 unit/integration/component + 52 e2e**, core 99.4% stmts | TESTING.md |

## Accessibility
| Evidence in code | Tests | Docs |
|---|---|---|
| Semantic landmarks, one `h1`/page, skip link `#main-content`, ARIA meters ([ui.tsx](apps/web/components/ui.tsx)), theme-aware `--on-primary` contrast ([globals.css](apps/web/app/globals.css)), RTL, keyboard-complete, `autocomplete` | `e2e/a11y.spec.ts` — axe on **10 routes × light+dark = 20** | ACCESSIBILITY.md |

## Google Services
| Evidence in code | Tests | Docs |
|---|---|---|
| Evidence-as-code catalog ([service-catalog.ts](packages/core/src/google/service-catalog.ts)) → `GET /api/google/services` ([meta.ts](apps/api/src/routes/meta.ts)) → `/google-services` page ([apps/web/app/google-services](apps/web/app/google-services/page.tsx)); Gemini client ([gemini-client.ts](apps/api/src/services/gemini-client.ts)); deploy uses Cloud Build/Run/Artifact Registry/Secret Manager/Logging ([scripts/deploy.ps1](scripts/deploy.ps1)) | `service-catalog.test.ts` honesty invariants; `security.test.ts` secret-absence | GOOGLE_SERVICES.md |

## Problem Alignment
Every feature traces to a documented June–July 2026 incident (README "The problem"). All 8 challenge dimensions and 4 personas are covered and named.
