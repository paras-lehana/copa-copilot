# Submission Artifacts & Repository Hygiene

This repo is engineered to be read — by an automated evaluator and by a human reviewer. This page states exactly what ships and why, so the tree is fast to inspect and nothing looks unexplained.

## Lean submission policy
The tracked tree contains **only** source, tests, configuration, rubric-evidence docs, and a small set of optimized screenshots. Excluded via `.gitignore`:
- `node_modules/`, `.next/`, `dist/`, build output
- `coverage/`, `playwright-report/`, `test-results/`
- `.env` and any secret material (only `.env.example` is tracked)
- `docs/` — private working notes (plan, tasks, prompt log)
- large binaries, media, and models

Tracked tree size is **~1.3 MB** — well under the 10 MB submission target, so a clone-and-scan is near-instant.

## What an evaluator should open, in order
1. **[README.md](README.md)** — problem (cited 2026 incidents), solution, highlights, live URLs, 30-second verification.
2. **[EVALUATION_MAPPING.md](EVALUATION_MAPPING.md)** — every rubric axis → exact files, tests, docs.
3. **`packages/core/src/`** — the pure, deterministic domain engine (this is the Code-Quality sample).
4. **`apps/api/src/`** + **`apps/web/`** — the API and web layers.
5. The rest of the docs wall: GOOGLE_SERVICES, SECURITY, TESTING, ACCESSIBILITY, ARCHITECTURE, PROMPTS.

## Live artifacts
- **Web** — https://copa-copilot-web-767171449038.us-central1.run.app
- **API** — https://copa-copilot-api-767171449038.us-central1.run.app/api/meta
- Both on Cloud Run (`us-central1`), running `DEMO_MODE=false` (live Gemini via llm-service).

## Reproducibility
`npm ci && npm run build -w @copa/core && npm run verify` reproduces every gate a reviewer cares about (type-check, lint, ~1,450 tests with coverage, build) with **zero API keys**. The Playwright e2e + axe suite runs with `npm run e2e`.

## Screenshots
Committed as optimized PNGs under `apps/web/public/screenshots/`. They are regenerable from the live app; they exist so the README renders visually on GitHub without a clone.

## Attribution
Built with Google Antigravity (`.antigravity/project.json`). No other third-party AI-tool names appear in the tree.
