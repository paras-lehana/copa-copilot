# Contributing to Copa Copilot

Thanks for looking under the hood. This project is built to a strict quality bar; the same gates that guard `main` are the ones an evaluator will see.

## Prerequisites
- Node.js ≥ 20, npm ≥ 10.

## Setup
```bash
npm ci
npm run build -w @copa/core   # core must build once so api/web can resolve it
```

## The one command that must pass
```bash
npm run verify   # type-check → lint → test (with coverage) → build
```
CI runs exactly this, plus the Playwright e2e + axe suite (`npm run e2e`). A change is not done until `verify` is green.

## House rules (enforced by ESLint + `scripts/grep-census.ps1`)
- TypeScript strict everywhere; **no `any`**, no non-null assertions.
- **No `console.*`** in source — the API logs through the structured sink only.
- No `TODO`/`FIXME`, no `eslint-disable`, no `@ts-` suppressions in source.
- Files stay focused (< ~400 lines); each opens with a one-line responsibility comment.
- Comments explain *why* (a source, a security or efficiency reason), never restate the code.

## Testing conventions
- **Derive fixtures from the engine** — never hardcode a magic number a factor change could invalidate.
- One test file per module; use `test.each` matrices for scenario × profile × venue × language grids.
- Every API endpoint gets success + failure-class coverage; every route gets an axe scan in light **and** dark.

## Commits
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Never commit secrets. AI keys live in the gitignored `apps/api/.env` locally and in Secret Manager in production.

## Architecture in one line
`apps/web` + `apps/api` depend on `@copa/core`; core depends on nothing but `zod` and is pure (no clock, no RNG). See [ARCHITECTURE.md](ARCHITECTURE.md).
