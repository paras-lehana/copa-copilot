# Security — Copa Copilot

Copa Copilot implements defence-in-depth sized to its role: a public, key-bearing operations
copilot for all 16 FIFA World Cup 2026 venues, deployed on Google Cloud Run. The posture is
deliberately conservative — **no PII is collected and there are no biometrics by design** — and
every control described here is backed by source in the repository and by tests in the
`security.test.ts` suite. This document is the canonical description of the threat model, the
layered controls, secret handling, the error contract, and the responsible-AI boundary. The
authoritative in-repo companion is [`SECURITY.md`](../SECURITY.md); the prompt-injection boundary
and grounding design are detailed in [AI Assistant & Grounding Design](./03-ai-assistant.md).

---

## 1. Threat model (STRIDE-lite)

The model maps each realistic threat to a concrete control and the file that enforces it. It is
"STRIDE-lite" because it prunes categories that do not apply to a stateless, no-account,
no-PII service, and concentrates on the classes that a public AI endpoint with a server-side
upstream key actually faces.

| # | Category | Threat | Control | Where |
|---|----------|--------|---------|-------|
| 1 | **Spoofing** | Client forges `X-Forwarded-For` to escape a rate bucket | `trust proxy` pinned to exactly one hop (Cloud Run's front end) so `req.ip` is the real client | `apps/api/src/server.ts` |
| 2 | **Tampering** | Extra or malformed keys smuggled into a request body | Zod `.strict()` on every endpoint; unknown keys rejected before a handler runs | `packages/core/src/schemas.ts`, `apps/api/src/middleware/validate.ts` |
| 3 | **Repudiation** | No audit trail for a request | Structured, Cloud-Logging-shaped request logs (method, path, status, latency) | `apps/api/src/middleware/logger.ts` |
| 4 | **Info disclosure** (input echo) | A validation error reflects secret-looking input back to the caller | Custom zod error map returns field-name-only messages; a test asserts no secret value ever appears in an error | `schemas.ts` (`safeErrorMap`), `schemas.test.ts` |
| 5 | **Info disclosure** (secrets) | The upstream key leaks via URL, log, or error | Key is server-side only, sent as the `X-Internal-Key` header, mounted from Secret Manager by reference; a secret-absence sweep runs over every GET endpoint | `apps/api/src/services/llm-client.ts`, `security.test.ts` |
| 6 | **Info disclosure** (upstream) | An upstream error body echoes request contents into ours | llm-service failures collapse to `UPSTREAM_FAILURE`; bodies and auth are never logged | `apps/api/src/services/llm-client.ts` |
| 7 | **Denial of service** | Request flood or oversized bodies exhaust an instance | Per-IP token buckets (60/min general, 10/min assistant), 32 kb JSON body cap, `--max-instances=3` | `apps/api/src/middleware/rate-limit.ts`, `server.ts` |
| 8 | **Elevation** (prompt injection) | Text inside the user turn re-instructs the model | Per-request nonce fence + `VERIFIED_STADIUM_DATA` grounding, refusal rules, red-team suite | `prompt-boundary.ts` — see [AI Assistant](./03-ai-assistant.md) |
| 9 | **Elevation** (point minting) | Client claims restored points or replays a mission | Client-restored points clamped server-side; mission replay rejected | `packages/core/src/gamification.ts` (`clampRestoredPoints`) |
| 10 | **Elevation** (Trojan-Source / bidi) | Zero-width or bidi-override characters hide instructions in "clean" text | Unicode sanitiser strips C0/C1 control, zero-width, and bidi-override code points after zod, before the model | `apps/api/src/middleware/sanitize.ts` |
| 11 | **SSRF** | An injected upstream URL redirects the key-bearing POST at a metadata endpoint | Allow-list guard `isAllowedLlmUrl` refuses any non-HTTPS or non-allow-listed host | `apps/api/src/services/llm-client.ts` (`isAllowedLlmUrl`) |
| 12 | **Misconfiguration** | Prod boots with a wildcard CORS origin or a plaintext upstream | Fail-closed startup self-test aborts production boot on a critical finding | `apps/api/src/services/security-selftest.ts` |
| 13 | **Traceability** | A failed request cannot be tied to a log line | Per-request correlation id `X-Request-Id`, inbound value validated `/^[A-Za-z0-9-]{1,64}$/`, echoed without logging content | `apps/api/src/middleware/request-id.ts` |

Rows 1–7, 12 and 13 are covered below. Rows 8 and 9 are covered in
[AI Assistant & Grounding Design](./03-ai-assistant.md) and the domain-model gamification
section respectively, since their controls live in the domain core and prompt boundary rather than
the HTTP edge.

---

## 2. Defence-in-depth: the request pipeline

`buildApp(config)` in `apps/api/src/server.ts` composes the Express application as a factory with
no listening socket, so tests exercise the real middleware stack through Supertest. Middleware is
ordered so that the cheapest, most protective checks run first. The composed order is:

```
trust proxy (1 hop) → security headers → CORS allow-list → 32 kb body cap
  → request-id → request logger → general rate limit → routers → error envelope
```

### 2.1 Single-hop trust proxy

```ts
app.set('trust proxy', 1);
app.disable('x-powered-by');
```

Cloud Run terminates TLS and forwards exactly one proxy hop, so `trust proxy` is pinned to `1`.
Express then reads the real client address from the correct position in `X-Forwarded-For`; a
client cannot prepend a forged address to jump rate buckets. `x-powered-by` is disabled so the
service does not advertise its framework.

### 2.2 Security headers

Every response carries hardening headers, set once in a single middleware before any route:

| Header | Value |
|--------|-------|
| `content-security-policy` | `default-src 'none'; frame-ancestors 'none'` |
| `x-content-type-options` | `nosniff` |
| `x-frame-options` | `DENY` |
| `referrer-policy` | `no-referrer` |
| `strict-transport-security` | `max-age=31536000; includeSubDomains` |
| `permissions-policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |

The API serves JSON only, so it can afford the strictest CSP, `default-src 'none'`. The
`permissions-policy` explicitly denies camera, microphone, geolocation, payment and USB — the
service has no need for any of them, consistent with the biometric-free design.

**CSP on the web origin — a documented choice.** The Next.js web origin ships the same safe
hardening headers (nosniff, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS, `Permissions-Policy`)
but deliberately does **not** send a Content-Security-Policy. A CSP that permitted the inline
scripts Next.js 15 hydration requires would need `'unsafe-inline'`, which documents its own bypass
and is weaker than shipping no CSP at all. A hash-based CSP is the planned upgrade. This is an
intentional, recorded decision rather than an omission.

### 2.3 CORS allow-list

CORS headers are emitted only for origins present in `config.allowedOrigins`. A non-listed origin
receives no CORS headers at all — the browser blocks the cross-origin read:

```ts
const origin = req.header('origin');
if (origin !== undefined && config.allowedOrigins.includes(origin)) {
  res.set({
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type,accept-language',
    vary: 'Origin',
  });
}
```

The allow-list is exact-match, and `Vary: Origin` is set so caches do not serve one origin's CORS
decision to another. A wildcard entry (`*`) or a non-HTTPS origin in production is a critical
finding for the startup self-test (Section 4).

### 2.4 Body-size cap

```ts
export const BODY_LIMIT = '32kb';
app.use(express.json({ limit: BODY_LIMIT }));
```

The largest legitimate request is far below 32 kb, so the cap bounds memory per request and blunts
oversized-payload DoS. A body over the limit is rejected with `PAYLOAD_TOO_LARGE` (413) by the
terminal error middleware, which inspects `err.type === 'entity.too.large'`.

### 2.5 Per-IP token-bucket rate limits

`apps/api/src/middleware/rate-limit.ts` implements a continuously-refilling token bucket with named
tiers:

```ts
export const RATE_TIERS = {
  general: { capacityPerMinute: 60 },
  assistant: { capacityPerMinute: 10 },
} as const;
```

- The **general** tier (60 requests/min per IP) applies to the whole API.
- The **assistant** tier (10 requests/min per IP) is stricter because `/api/assistant/query` and
  `/api/ops/briefing` drive Gemini spend through the llm-service proxy.

Buckets refill proportionally to elapsed time (`elapsedMinutes * capacity`), so there is no fixed
window edge to exploit. State is per-process, keyed on `req.ip`; because Cloud Run runs at most
three instances (`--max-instances=3`) with scale-to-zero, per-instance buckets are an accepted
approximation rather than a distributed limiter. Idle buckets are pruned opportunistically on
traffic — `prune()` drops buckets untouched for over ten minutes — so there are no background
timers and memory stays bounded. A throttled request returns `RATE_LIMITED` (429) with a
`Retry-After: 30` header, in the standard error envelope.

### 2.6 Correlation ids

`apps/api/src/middleware/request-id.ts` assigns every request a correlation id and echoes it in the
`X-Request-Id` response header. An inbound `X-Request-Id` is honoured only when it matches
`/^[A-Za-z0-9-]{1,64}$/`; otherwise a fresh id is generated from the injected clock and a seeded
counter (no `Math.random`, so the value is deterministic under test):

```ts
const id =
  inbound !== undefined && /^[A-Za-z0-9-]{1,64}$/.test(inbound)
    ? inbound
    : `req-${now().getTime().toString(36)}-${(counter += 1).toString(36)}`;
```

The id lets a caller reference a failed request and ties a client report to server logs **without
logging any user content**. The bounded regex prevents a hostile inbound id from injecting newlines
or unbounded text into log lines (log-forging defence).

---

## 3. Added hardening

Four controls go beyond a conventional Express hardening baseline. Each is a pure, unit-tested
function so every branch is exercised in `security.test.ts`.

### 3.1 Unicode / bidi input sanitiser (Trojan-Source)

`apps/api/src/middleware/sanitize.ts` runs **after** zod validation and **before** the model or any
log. Zod already rejects malformed, oversized and markup input; the sanitiser removes the residual
class of characters that pass a type check but poison logs, terminals, or a downstream prompt —
the Trojan-Source family (CVE-2021-42574).

It strips, by explicit code-point check rather than an opaque control-character regex:

- **C0/C1 control characters** (`<= 0x1f`, and `0x7f`–`0x9f`), except tab, newline and carriage
  return, which are legitimate whitespace and get collapsed rather than deleted.
- **Invisible / format code points** that hide instructions inside otherwise clean-looking text:

```ts
const INVISIBLE_CODE_POINTS = new Set<number>([
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, // zero-width space/joiner + LTR/RTL marks
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, // bidi embeddings + overrides
  0x2060, 0xfeff,                         // word joiner, BOM / zero-width no-break space
]);
```

After stripping, `sanitizeText` collapses whitespace runs, trims, and caps length at
`MAX_SANITIZED_LENGTH = 2000`, so a single field can never blow up a log line or the prompt
window. A companion predicate `hasSuspiciousChars` flags — rather than silently accepts — input
containing these characters. This control complements the nonce fence of the prompt-injection
boundary (row 10 vs row 8 in the threat model): the fence stops instruction re-writing in plain
text, the sanitiser stops it in invisible text.

### 3.2 SSRF allow-list on the key-bearing upstream

The llm-service base URL is read from the environment, so before the internal key is ever attached
and a request is POSTed, `isAllowedLlmUrl` in `apps/api/src/services/llm-client.ts` confirms the
target is HTTPS (or localhost for tests) on an allow-listed host:

```ts
const ALLOWED_LLM_HOSTS = new Set(['llm.lehana.in', 'localhost', '127.0.0.1', 'llm.example']);

export function isAllowedLlmUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const httpsOrLocal =
      url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return httpsOrLocal && ALLOWED_LLM_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
```

`llmComplete` re-checks the guard immediately before the call and returns `UPSTREAM_FAILURE` if it
fails, so an injected `LLM_SERVICE_URL` cannot redirect a key-bearing request at a cloud-metadata
endpoint or an internal VPC host. The same guard is reused by the startup self-test, so a bad
upstream URL is caught at boot, not just per request.

### 3.3 Fail-closed startup self-test

`apps/api/src/services/security-selftest.ts` audits the **assembled** runtime configuration before
the API binds a socket — the class of misconfiguration that no handler unit test would catch. It is
a pure, total function (no I/O, no throw) returning a sorted list of findings, so every branch is
unit-tested. `main.ts` logs the findings and, in production, calls `process.exit(1)` on any
**critical** finding.

| Finding id | Severity | Trigger |
|------------|----------|---------|
| `cors-wildcard` | critical | Allow-list contains `*` |
| `cors-insecure` | critical | A non-HTTPS, non-localhost origin in production |
| `llm-upstream-unsafe` | critical | Key-bearing upstream is not an allow-listed HTTPS host |
| `live-without-key` | warning | Prod claims live mode but has no key (silently serves demo) |
| `demo-in-production` | warning | Prod is running the deterministic demo path (informational) |

Critical findings abort the boot (fail-closed); warnings — such as the graceful "no key ⇒ demo
path" degradation — are surfaced and tolerated. Findings are sorted critical-first so a scanning
operator, or the fail-closed guard, sees blockers at the top. Each `SecurityFinding.message` is
operator-facing and, by contract, never contains a secret value.

### 3.4 Per-request correlation ids

Described in Section 2.6; listed here as one of the four added hardening controls because it
underpins traceability (threat-model row 13) across the whole pipeline.

---

## 4. Secret management

The only secret the service holds is the **service-to-service key for the llm-service proxy** — not
a provider (Gemini) key. Centralising inference behind `https://llm.lehana.in` means key
management, cost control and provider rate limiting live in the proxy, and the app carries a single
internal credential.

Handling rules, all enforced in code:

- **Server-side only.** The key never reaches the browser. The web app calls the API; the API calls
  the proxy.
- **Header, never URL.** In `llm-client.ts` the key is sent as the `x-internal-key` header on the
  POST to `${baseUrl}/smk/${endpoint}`. It never appears in a query string, path, log line, or
  error message.
- **Mounted by reference from Secret Manager.** In production the key is injected from Google Secret
  Manager by reference into the Cloud Run environment; it is not baked into the repository or the
  container image. See [Deployment & Operations](./09-deployment.md) for the mount mechanics.
- **Absence is a safe degradation, not a crash.** If no key is present in production, the self-test
  raises the `live-without-key` warning and the assistant serves the deterministic demo path rather
  than failing.
- **Never echoed upstream-to-downstream.** On any upstream error, `llmComplete` returns status only
  (`llm-service HTTP <status>`), never the upstream body, which could echo request contents or auth
  material.
- **Tested for absence.** The `security.test.ts` suite runs a secret-absence sweep over every GET
  endpoint, asserting the key value never appears in any response, and asserts no secret ever
  surfaces in a validation error.

> Deploy note documented for this monorepo: when storing the key, write it byte-exact — piping a
> value through PowerShell can append a trailing CR/LF and corrupt the secret. The key is stored via
> a temporary file rather than a shell pipe.

---

## 5. The error envelope

Every failure — validation, not-found, rate-limit, oversized body, upstream failure, and internal
error alike — returns exactly one shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…" } }
```

The `message` is a localized, safe string with no internals: no stack, no file path, no upstream
body, no field value. The code taxonomy is fixed:

| Code | HTTP |
|------|------|
| `VALIDATION_FAILED` | 400 |
| `NOT_FOUND` | 404 |
| `RATE_LIMITED` | 429 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `UPSTREAM_FAILURE` | 502 |
| `ASSISTANT_UNAVAILABLE` | 503 |
| `ROUTE_UNAVAILABLE` | 409 |
| `MISSION_REJECTED` | 422 |
| `INTERNAL` | 500 |

**Non-serialized diagnostics.** Server-only detail lives in an `AppError.diagnostics` field that is
never included in the serialized response — a fact asserted by tests. This keeps rich context
available in structured logs while guaranteeing it cannot leak to a client. The `sendError` helper
in `apps/api/src/middleware/validate.ts` is the single serialization point, so the envelope shape is
enforced in one place; the terminal handlers in `server.ts` route unknown routes to `NOT_FOUND` and
malformed-JSON / oversized bodies to `VALIDATION_FAILED` or `PAYLOAD_TOO_LARGE` through the same
helper. The `safeErrorMap` in `packages/core/src/schemas.ts` guarantees zod validation messages
name only the offending field, never its value. The full contract is documented in the
[API Reference](./10-api-reference.md).

---

## 6. Responsible AI

The assistant is a grounded copilot, not an open chatbot. Its behavioural contract:

- **Grounded exclusively in engine output.** Replies are constructed from the deterministic
  `@copa/core` engine tool output wrapped as `VERIFIED_STADIUM_DATA`; the model does not answer from
  parametric knowledge about a specific venue's live state.
- **Cannot be re-instructed by the user turn.** User text is wrapped in a per-request nonce fence;
  instructions inside that fence are treated as data, not commands. The invisible-character
  sanitiser (Section 3.1) closes the bidi/zero-width variant of the same attack.
- **Refuses disallowed requests.** The assistant refuses requests for PII, security bypass, and
  restricted-area access, and does not disclose internal configuration.
- **Directs emergencies to humans.** A medical or safety emergency is routed to first aid and venue
  staff; the assistant does not attempt diagnosis or triage in the user's place.
- **Bounded output.** Replies are capped at 180 words with a 1,000-character input cap, limiting both
  cost and the surface for injected content.
- **Honest engine labelling.** Production runs `DEMO_MODE=false`, so `/api/assistant/query` returns
  `engine: "gemini"`; on any upstream failure the service falls back to the deterministic demo path
  rather than fabricating a live answer. The refusal recall and grounded-faithfulness of this
  boundary are exercised by the evals harness described in [AI Assistant](./03-ai-assistant.md).

---

## 7. Supply chain and platform hardening

- **Dependency audit.** CI runs `npm audit --omit=dev --audit-level=moderate`; `overrides` pin
  known-safe transitive versions.
- **Pinned CI.** GitHub Actions are pinned to full commit SHAs, so a moved tag cannot swap the
  action out under the pipeline.
- **Pinned, non-root images.** Docker base images are pinned by digest and run as the non-root
  `node` user in a multi-stage build.
- **Minimal runtime footprint.** The domain core `@copa/core` has zero runtime dependencies beyond
  `zod ^3.24`, shrinking the attack surface of the code that produces every number the assistant
  grounds on.
- **Bounded scale.** Cloud Run runs with `--max-instances=3` and scale-to-zero, capping both cost
  and the blast radius of a traffic spike.

See [Deployment & Operations](./09-deployment.md) for the build pipeline and
[Testing Strategy](./05-testing.md) for how the `security.test.ts` suite and coverage gates keep
these controls verified in CI.
