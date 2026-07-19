# Deployment & Operations — Copa Copilot

This document describes how Copa Copilot is built, deployed, configured, and
operated on Google Cloud. It is the canonical operational reference for the two
Cloud Run services that make up the running product — the Express API and the
Next.js web app — and covers the build pipeline, the one-command deploy script,
the typed configuration model, secret handling, continuous integration, and the
observability contract.

For the surrounding context, see [System Architecture](./01-architecture.md) for
how the three packages fit together, [Security](./06-security.md) for the full
threat model that the operational controls here enforce, and
[Google Cloud & Gemini Integration](./08-google-cloud.md) for how each Google
service is used.

---

## 1. Deployment topology

Copa Copilot runs as two independent, publicly reachable Cloud Run services in a
single region:

| Service | Cloud Run name | Serves | Container entrypoint | Port |
|---|---|---|---|---|
| API | `copa-copilot-api` | Express 4 REST API (`@copa/api`) | `node apps/api/dist/main.js` | 8080 |
| Web | `copa-copilot-web` | Next.js 15 / React 19 app (`@copa/web`) | `node apps/web/server.js` | 8080 |

Both services are:

- Deployed to **region `us-central1`** in GCP project
  **`copa-copilot-prod`** (project number `767171449038`).
- Configured with `--allow-unauthenticated` (the product is a public copilot; all
  authorization decisions live inside the API, not in the Cloud Run IAM layer).
- Capped at `--max-instances=3` with a `512Mi` memory allocation, and scale to
  zero when idle. The instance cap is a deliberate cost bound appropriate to the
  service scale; it is also part of the denial-of-service posture described in
  [Security](./06-security.md).
- Sourced from images stored in **Artifact Registry** (Docker repository
  `copa-copilot`, same region) and produced by **Cloud Build**.

The web app calls the API over HTTPS. The API URL is baked into the web client
bundle at build time (see [Section 4.3](#43-web-service-configuration)), and the
API in turn allows the web origin through CORS (see
[Section 6](#6-configuration-model)).

### Live environment URLs

The current production deployment is reachable at:

| Resource | URL |
|---|---|
| Web app | `https://copa-copilot-web-ktdjm6xcyq-uc.a.run.app` |
| API | `https://copa-copilot-api-ktdjm6xcyq-uc.a.run.app` |
| API metadata | `https://copa-copilot-api-ktdjm6xcyq-uc.a.run.app/api/meta` |
| Source repository | `https://github.com/paras-lehana/copa-copilot` |

> **Note on URL forms.** Cloud Run exposes each service under two equivalent
> hostnames: the hash form (`…-ktdjm6xcyq-uc.a.run.app`, authoritative for
> verification here) and the project-number form
> (`…-767171449038.us-central1.run.app`). Some in-repo documents, such as the
> `CHANGELOG` version blockquotes, reference the project-number form. Both
> resolve to the same services; prefer the hash form above for operational
> checks.

---

## 2. Build pipeline

The path from source to a running revision is:

```
source (npm-workspaces monorepo)
   └─ multi-stage Docker build (apps/api/Dockerfile · apps/web/Dockerfile)
        └─ Cloud Build (cloudbuild-api.yaml · cloudbuild-web.yaml)
             └─ Artifact Registry (us-central1-docker.pkg.dev/…/copa-copilot)
                  └─ Cloud Run deploy (copa-copilot-api · copa-copilot-web, us-central1)
```

### 2.1 Multi-stage Docker images

Both images are multi-stage, non-root, and pinned to a Node 20 LTS Alpine base
**by digest** rather than by tag, so the runtime base is reproducible and cannot
drift:

```dockerfile
FROM node:20-alpine@sha256:d3507a213936fe4ef54760a186e113db5188472d9efdf491686bd94580a1c1e8 AS build
```

Because the code is an npm-workspaces monorepo with a shared domain core
(`@copa/core`), every image is **built from the repository root** so the
workspace graph resolves. The build stage installs the full dependency graph,
compiles `@copa/core` first, then the target app.

**API image (`apps/api/Dockerfile`).** The build stage runs
`npm ci --no-audit --no-fund`, then
`npm run build -w @copa/core && npm run build -w @copa/api`. The runtime stage
re-installs with `npm ci --omit=dev` (pruning dev dependencies for a lean
image), copies only the compiled `dist` output for `@copa/core` and `@copa/api`,
switches to the built-in non-root `node` user, exposes port 8080, and runs
`node apps/api/dist/main.js`. Cloud Run injects the `PORT` environment variable
(default 8080), which the API reads through its typed configuration.

**Web image (`apps/web/Dockerfile`).** The build stage compiles `@copa/core`
then builds the web app with Next.js **standalone output**. The API base URL is
supplied as a Docker build argument and promoted to
`NEXT_PUBLIC_API_BASE_URL`, so it is compiled into the client bundle (see
[Section 4.3](#43-web-service-configuration)). `NEXT_TELEMETRY_DISABLED=1` is
set. The runtime stage copies the standalone server, the `.next/static` assets,
and `public/`, runs as the non-root `node` user, and starts
`node apps/web/server.js`.

Both images: multi-stage, non-root, digest-pinned. These properties are part of
the supply-chain posture recorded in [Security](./06-security.md).

### 2.2 Cloud Build configurations

Each service has its own Cloud Build config with three steps — **build**,
**push**, **deploy** — plus an `images` block that records the produced artifact:

| Config | Image tag pattern | Deploy target |
|---|---|---|
| `cloudbuild-api.yaml` | `${_REGION}-docker.pkg.dev/$PROJECT_ID/copa-copilot/api:$BUILD_ID` | `copa-copilot-api` |
| `cloudbuild-web.yaml` | `${_REGION}-docker.pkg.dev/$PROJECT_ID/copa-copilot/web:$BUILD_ID` | `copa-copilot-web` |

Key substitutions and options:

- `_REGION` defaults to `us-central1`; `_REPO` is `copa-copilot`; `_SERVICE` is
  the Cloud Run service name.
- Images are tagged with the Cloud Build `$BUILD_ID`, so every build is uniquely
  addressable and the deployed revision maps back to a specific build.
- The deploy step uses the `cloud-sdk:slim` builder to run
  `gcloud run deploy` with `--allow-unauthenticated --port=8080 --memory=512Mi
  --max-instances=3`.
- `options.logging: CLOUD_LOGGING_ONLY` — build logs go to Cloud Logging.
- The web config additionally threads `_API_BASE_URL` into the Docker build as
  `--build-arg API_BASE_URL=…`.

Secrets are never referenced in either Cloud Build config, and never baked into
an image. Secret attachment is a separate service-level operation performed by
the deploy script (see [Section 5](#5-secret-management)).

---

## 3. One-command deployment

`scripts/deploy.ps1` performs the full end-to-end deployment from a developer
workstation. It is a Windows PowerShell script; its prerequisites are an
authenticated `gcloud` CLI and a billing-enabled project.

```powershell
.\scripts\deploy.ps1 -ProjectId copa-copilot-prod -Region us-central1
```

Both parameters have defaults (the configured production project and
`us-central1`), so a bare `.\scripts\deploy.ps1` targets the standard
production environment. Pass `-ProjectId` to deploy to your own project.

The script runs the following steps in order, each idempotent:

1. **Set the active project** — `gcloud config set project $ProjectId`.
2. **Enable required services** (idempotent) — `run.googleapis.com`,
   `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`,
   `secretmanager.googleapis.com`.
3. **Ensure the Artifact Registry repo exists** — creates the `copa-copilot`
   Docker repository in the region if it is not already present.
4. **Build + deploy the API** —
   `gcloud builds submit --config cloudbuild-api.yaml`, which builds, pushes, and
   deploys `copa-copilot-api`.
5. **Provision and attach the llm-service secret** (only when a local key is
   present) — see [Section 5](#5-secret-management) for the full sequence. When a
   key is found, the service is switched to live mode with
   `DEMO_MODE=false` and the upstream configuration
   (`LLM_SERVICE_URL`, `LLM_ENDPOINT`, `LLM_MODEL=gemini-3-flash`) applied.
6. **Resolve the deployed API URL** —
   `gcloud run services describe copa-copilot-api --format='value(status.url)'`.
7. **Build + deploy the web app** —
   `gcloud builds submit --config cloudbuild-web.yaml` with
   `_API_BASE_URL` set to the freshly resolved API URL, so the client bundle
   points at the live API.
8. **Open the API CORS allow-list to the web origin** — updates the API's
   `ALLOWED_ORIGINS` to the resolved web URL plus `http://localhost:3100` for
   local development.
9. **Print the deployment summary** — the web URL, API URL, and a smoke-test
   `curl` for `/api/meta`.

The ordering matters: the API is deployed first so its URL exists before the web
build (which must embed that URL), and CORS is opened last, once the web URL is
known. If no local key file is present, steps 5's secret work is skipped and the
API stays on the demo path — a safe default rather than a broken live path.

---

## 4. Environments

Copa Copilot has two operating modes rather than a proliferation of named
environments. The mode is a function of configuration, not of separate code
paths, which keeps behavior predictable and testable.

### 4.1 Local / demo environment

Run locally with no API keys. Configuration defaults resolve `DEMO_MODE` to
`true` (see [Section 6](#6-configuration-model)), so the assistant and every
engine produce deterministic replies from the same `@copa/core` engines that
power live mode. This is the environment CI exercises and the one a new engineer
gets on first checkout. It requires zero secrets.

### 4.2 Production environment

The live Cloud Run deployment runs `DEMO_MODE=false` with the llm-service key
mounted from Secret Manager, so `POST /api/assistant/query` returns real Gemini
(`gemini-3-flash`) responses and reports `engine: "gemini"`. On any upstream
failure the assistant automatically falls back to the deterministic demo path, so
a proxy outage degrades response quality without producing an outage. See
[AI Assistant & Grounding Design](./03-ai-assistant.md) for the grounding and
fallback behavior.

### 4.3 Web service configuration

The web app has one build-time input: the API base URL. It is passed as the
`API_BASE_URL` Docker build argument, promoted to `NEXT_PUBLIC_API_BASE_URL`
during the Next.js build, and compiled into the client bundle. Because it is a
build-time value, the web image is bound to a specific API URL; redeploying the
web app against a different API means rebuilding with a new `_API_BASE_URL`. The
deploy script handles this automatically by resolving the API URL before the web
build.

---

## 5. Secret management

The only secret in the system is the **llm-service internal key**, sent to the
Lehana llm-service proxy as the `X-Internal-Key` header on outbound inference
calls. It is never sent to a browser, never written into an image, never checked
into the repository, and never placed in the viewer-visible Cloud Run environment
configuration.

### 5.1 Storage and mounting

The key is stored in **Secret Manager** as the secret `llm-internal-key` and
**mounted on the API service by reference** as the environment variable
`LLM_INTERNAL_KEY`. The deploy script performs the following, only when a local
`apps/api/.env` contains an `LLM_INTERNAL_KEY` value:

1. Read the key from the gitignored `apps/api/.env`.
2. Write it to a temporary file, then create the secret (or add a new version if
   it already exists) with `gcloud secrets ... --data-file=…`.
3. Grant `roles/secretmanager.secretAccessor` on `llm-internal-key` to the
   project's compute service account
   (`<projectNumber>-compute@developer.gserviceaccount.com`).
4. Delete the temporary file.
5. Update the API service to mount the secret by reference:
   `--update-secrets="LLM_INTERNAL_KEY=llm-internal-key:latest"`, and switch to
   live mode (`DEMO_MODE=false`) with the upstream settings.

Because the mount is `llm-internal-key:latest`, adding a new secret version and
redeploying rotates the key; the image never changes.

### 5.2 Operations note — store the secret byte-exact

The secret value must be stored **byte-exact, with no trailing newline**. A
trailing newline (for example a CRLF appended when a value is piped into
`gcloud` on Windows) is carried into the mounted secret and becomes part of the
outgoing `X-Internal-Key` header value. That produces an illegal HTTP header
value; the upstream rejects the request, and the API degrades to the demo path
without an obvious error. The deploy script therefore writes the key to a
temporary file using an explicit no-BOM UTF-8 encoding rather than piping it, so
the stored bytes are exactly the key:

```powershell
[System.IO.File]::WriteAllText($keyFile, $llmKey, (New-Object System.Text.UTF8Encoding($false)))
```

A defensive second layer exists in the application: `apps/api/src/config.ts`
declares `llmInternalKey` with a `z.string().trim()` schema, so a stray
surrounding newline is trimmed before the header is composed. Both controls are
intentional — store the value cleanly, and tolerate a mis-stored value rather
than silently emit a malformed header. When rotating or re-provisioning the
key, verify the stored value has no trailing whitespace.

---

## 6. Configuration model

All runtime configuration is centralized in `apps/api/src/config.ts`, which is
**the only place `process.env` is read** in the API. Everything downstream
receives a typed, validated `AppConfig`, which is what makes `buildApp(config)`
fully testable — API tests pass plain configuration objects rather than mutating
the environment.

### 6.1 Typed AppConfig

`loadConfig(env)` parses the environment through a zod schema and returns an
`AppConfig`. The recognized settings:

| Field | Environment variable | Default | Notes |
|---|---|---|---|
| `port` | `PORT` | `8080` | Coerced integer, 1–65535. Injected by Cloud Run. |
| `demoMode` | `DEMO_MODE` | environment-derived (see below) | `true` runs the deterministic demo path. |
| `llmServiceUrl` | `LLM_SERVICE_URL` | `https://llm.lehana.in` | OpenAI-compatible proxy; never a direct provider call. |
| `llmEndpoint` | `LLM_ENDPOINT` | `antigravity-manager` | Proxy endpoint name. |
| `llmModel` | `LLM_MODEL` | `gemini-3-flash` | Inference model. |
| `llmInternalKey` | `LLM_INTERNAL_KEY` | `''` (trimmed) | Empty ⇒ demo path. Mounted from Secret Manager. |
| `allowedOrigins` | `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS allow-list. |
| `simSeed` | `SIM_SEED` | `26` | Deterministic simulation seed. |

`AppConfig` also carries two derived, non-environment fields: an injectable
`now()` clock (so API tests can freeze time) and an `isProduction` flag.

### 6.2 Production detection and the safe DEMO_MODE default

`isProduction` is derived as
`env.NODE_ENV === 'production' || env.K_SERVICE !== undefined`. `K_SERVICE` is
set automatically by Cloud Run, so the API knows it is running in production
without any explicit flag.

`DEMO_MODE` follows a **fail-safe default keyed to the environment**: when the
variable is unset, demo mode is `!isProduction` — opt-out locally, opt-in in
production. The intent, stated in the source, is to never accidentally live-demo:
a local checkout defaults to the deterministic demo path, while production only
runs live when `DEMO_MODE=false` is set explicitly (as the deploy script does
once a key is attached). When the variable is set, `DEMO_MODE === 'true'` is
honored verbatim.

### 6.3 Fail-closed startup self-test

Before the API binds a socket, `apps/api/src/main.ts` audits the fully-assembled
configuration through `runSecuritySelfTest(config)`
(`apps/api/src/services/security-selftest.ts`). This catches the class of failure
that unit tests of individual handlers cannot: **misconfiguration of the service
as a whole**.

The self-test returns a list of findings, sorted critical-first:

| Finding id | Severity | Trigger |
|---|---|---|
| `cors-wildcard` | critical | The CORS allow-list contains `*`. |
| `cors-insecure` | critical | In production, a non-HTTPS, non-localhost origin is allow-listed. |
| `llm-upstream-unsafe` | critical | The key-bearing upstream URL is not an allow-listed HTTPS host. |
| `live-without-key` | warning | Production claims live mode but has no key (will serve demo). |
| `demo-in-production` | warning | Production is running the deterministic demo path. |

Every finding is logged. In production, **any critical finding aborts startup**
(`process.exit(1)`) rather than serving unsafely; warnings are surfaced but
tolerated. The self-test module is pure and total (no I/O, no throw), so every
branch is unit-tested in `security.test.ts`. This is the deployment-time
enforcement point for the CORS and upstream controls described in
[Security](./06-security.md).

---

## 7. Continuous integration

CI is defined in `.github/workflows/ci.yml` and runs on pushes and pull requests
to `main`. It uses a least-privilege token (`permissions: contents: read`) and
**pins every action by commit SHA** (with the human-readable version noted in a
trailing comment), so the toolchain cannot be silently changed under the
workflow. Two jobs run:

**`verify`** — the core gate, on `ubuntu-latest` with Node 20 and npm caching:

1. `npm ci --no-audit --no-fund`
2. `npm audit --omit=dev --audit-level=moderate` — a supply-chain gate on
   production dependencies at moderate severity and above.
3. `npm run type-check` — TypeScript strict, including
   `noUncheckedIndexedAccess`.
4. `npm run lint` — ESLint 9 flat config with typescript-eslint and Prettier.
5. `npm run test:coverage` — the unit + integration suites with coverage gates.
6. `npm run build` — every workspace compiles.

**`e2e`** — the browser suite: builds `@copa/core`, installs Playwright Chromium
with dependencies, and runs `npx playwright test --project=desktop` (the
Playwright + `@axe-core/playwright` end-to-end and accessibility scans). On
failure it uploads the `playwright-report/` artifact with a 7-day retention.

### Coverage gates

Coverage is enforced in CI, not merely reported:

- **`@copa/core`** — 99.4% statements; thresholds are lines/statements/functions
  ≥ 95, branches ≥ 90.
- **API** — 92% statements; gate ≥ 80.
- **Web** — coverage gate ≥ 55.

The full test taxonomy — 1,351 core unit, 160 API integration, 42 web component,
and 52 e2e tests (1,605 total) — is documented in
[Testing Strategy](./05-testing.md).

---

## 8. Observability

### 8.1 Structured request logs

All logging goes through `apps/api/src/middleware/logger.ts`. The logger emits
**one JSON object per line in Cloud Logging structured format** to stdout, which
Cloud Run forwards to Cloud Logging. There is no `console.log` anywhere in the
codebase; this sink is the single logging voice, which makes the redaction
contract auditable.

Each request log line carries `severity`, a `message`, an `httpRequest` block
(`requestMethod`, `requestUrl`, `status`, `latencyMs`), and an ISO-8601
`timestamp`. Severities map to Cloud Logging levels (`INFO`, `WARNING`,
`ERROR`); a status ≥ 500 is logged at `ERROR`.

### 8.2 Redaction contract — no user content logged

The logger is deliberately narrow. It records **method, path, status, and
latency only**. Specifically:

- The **query string is never logged** — the middleware logs `req.path`, not the
  full URL, because query values are user input.
- User free-text, upstream (Gemini) response bodies, request bodies, and
  environment values never appear in a log line.

This redaction contract is asserted by tests, and it satisfies the
repudiation/traceability and information-disclosure controls in
[Security](./06-security.md). No PII is collected by the product by design, so
there is no user content to leak into logs in the first place.

### 8.3 Correlation ids

`apps/api/src/middleware/request-id.ts` assigns a correlation id to every
request and echoes it in the `X-Request-Id` response header. If an inbound
`X-Request-Id` is present and matches the safe, bounded pattern
`/^[A-Za-z0-9-]{1,64}$/`, it is honored; otherwise a fresh id is derived from the
injected clock and a seeded counter (no `Math.random`, so it stays deterministic
under test). This lets a client reference a specific failed request and lets an
operator tie that report to server logs without logging any user content.

### 8.4 Operational events

Non-request events use `logEvent(...)` from the same logger — startup messages,
security self-test findings, and sanitized upstream failures. Callers pass short
static messages, never payloads. Upstream inference failures are sanitized to the
`UPSTREAM_FAILURE` error code, and upstream bodies and authorization headers are
never logged (see `llm-client.ts` and the error taxonomy in
[Security](./06-security.md)).

---

## 9. Verification

After a deploy, confirm both services in roughly 30 seconds with the following
`curl` checks against the live API.

**Service metadata** (also confirms the deployed app version):

```bash
curl https://copa-copilot-api-ktdjm6xcyq-uc.a.run.app/api/meta
```

`/api/meta` reports app version `0.2.0`. (The latest git tag is `v0.4.0`; the
value returned by `/api/meta` is the app package version `0.2.0`.)

**Health:**

```bash
curl https://copa-copilot-api-ktdjm6xcyq-uc.a.run.app/api/health
```

**Live assistant engine** — confirms production is running real Gemini rather
than the demo path. In the live deployment (`DEMO_MODE=false` with the key
mounted) this returns `engine: "gemini"`:

```bash
curl -X POST https://copa-copilot-api-ktdjm6xcyq-uc.a.run.app/api/assistant/query \
  -H 'Content-Type: application/json' \
  -d '{"venueId":"metlife","message":"When should I leave to beat the crowd?","locale":"en"}'
```

**Web app** — a `200` from the root confirms the web service is serving:

```bash
curl -I https://copa-copilot-web-ktdjm6xcyq-uc.a.run.app
```

The full request/response contracts for these endpoints, along with error codes
and rate limits, are in the [API Reference](./10-api-reference.md).

---

## 10. Operational reference

| Item | Value |
|---|---|
| GCP project | `copa-copilot-prod` (number `767171449038`) |
| Region | `us-central1` |
| Artifact Registry repo | `copa-copilot` (Docker) |
| API service | `copa-copilot-api` |
| Web service | `copa-copilot-web` |
| Secret | `llm-internal-key` (Secret Manager), mounted as `LLM_INTERNAL_KEY` |
| Runtime base image | `node:20-alpine`, digest-pinned |
| Cloud Run limits | `--memory=512Mi`, `--max-instances=3`, scale-to-zero |
| Container port | `8080` |
| Deploy command | `.\scripts\deploy.ps1 -ProjectId copa-copilot-prod -Region us-central1` |
| API build config | `cloudbuild-api.yaml` |
| Web build config | `cloudbuild-web.yaml` |
| CI workflow | `.github/workflows/ci.yml` |
| Node version | `>= 20` |
| Inference | Gemini `gemini-3-flash` via llm-service proxy (`https://llm.lehana.in`) |

### Related documentation

- [System Architecture](./01-architecture.md) — monorepo and package structure.
- [AI Assistant & Grounding Design](./03-ai-assistant.md) — live vs. demo path,
  Gemini grounding, fallback.
- [Testing Strategy](./05-testing.md) — the four test layers and coverage gates.
- [Security](./06-security.md) — full threat model, secret handling, the error
  envelope.
- [Google Cloud & Gemini Integration](./08-google-cloud.md) — the Google
  services catalogue.
- [API Reference](./10-api-reference.md) — endpoints, contracts, error codes,
  rate limits.
