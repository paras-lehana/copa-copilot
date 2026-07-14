# Changelog

All notable changes to Copa Copilot. Format: [Keep a Changelog](https://keepachangelog.com/); versioning: [SemVer](https://semver.org/).

## [0.1.0] — 2026-07-14

First working release: full stack built, tested and deployed to Cloud Run.

### Added
- **`@copa/core`** deterministic domain engine (17 modules): 16-venue registry, stadium graphs, seeded crowd/queue/transit simulation, crowd- & accessibility-aware routing, exit-wave advisor, weather-protocol state machine (8-mile lightning + heat tiers), incident triage, entry-readiness (anti-ghost-ticket), emission/sustainability math, gamification (missions + point formulas), leaderboards, i18n (6 languages, BCP-47 resolution), zod schema source, `Result<T,AppError>`, and the evidence-as-code Google service catalog. **1,300 tests, 99.4% statement coverage.**
- **`@copa/api`** Express service on Cloud Run: crowd/routing/egress/weather/incidents/entry/assistant/briefing/missions/leaderboard/google-services endpoints; `buildApp(config)` factory; zod validation with safe errors; per-IP token buckets; PII-safe structured logging; Gemini client with nonce-fenced prompt boundary and deterministic demo fallback; briefing TTL cache. **119 integration tests.**
- **`@copa/web`** Next.js 15 / React 19 app: dashboard, onboarding, map, assistant, ops, volunteer, missions, leaderboard, accessibility and `/google-services` routes; glassmorphism design system; light/dark themes with theme-aware contrast; 6-language i18n with RTL. **31 component tests.**
- **E2E**: Playwright axe scans on all 10 routes × light+dark, plus persona journeys on desktop + mobile. **52 tests.**
- **Delivery**: multi-stage non-root Dockerfiles, Cloud Build configs, one-command `scripts/deploy.ps1` (Secret Manager key mount), SHA-pinned GitHub Actions CI.
- **Docs wall**: README, EVALUATION_MAPPING, GOOGLE_SERVICES, SECURITY, TESTING, ACCESSIBILITY, ARCHITECTURE, PROMPTS.

### Deployed
- Web: https://copa-copilot-web-767171449038.us-central1.run.app
- API: https://copa-copilot-api-767171449038.us-central1.run.app
- Every page browser-verified against the live API with zero console errors.
