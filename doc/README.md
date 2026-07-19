# Copa Copilot — Documentation

Copa Copilot is a GenAI smart-stadium operations and fan copilot spanning all sixteen
FIFA World Cup 2026 venues. It gives fans, organizers, volunteers, and venue staff a
conversational, multilingual copilot grounded in a **deterministic stadium engine** — so
every figure the assistant states is reproducible in a unit test. The product is a
TypeScript-strict npm-workspaces monorepo: a pure domain core, an Express API on Google
Cloud Run, and a Next.js web application on Cloud Run.

This folder is the canonical documentation set. Each section is self-contained and
cross-linked; together they describe the product, its architecture, and every engineering
discipline behind it.

## Live environment

| Resource | URL |
|---|---|
| Web application | <https://copa-copilot-web-ktdjm6xcyq-uc.a.run.app> |
| API | <https://copa-copilot-api-ktdjm6xcyq-uc.a.run.app> |
| Source repository | <https://github.com/paras-lehana/copa-copilot> |

A thirty-second verification:

```bash
# Service metadata (name + version)
curl -s https://copa-copilot-api-ktdjm6xcyq-uc.a.run.app/api/meta

# A grounded, multilingual assistant answer (live Gemini via the llm-service proxy)
curl -s -X POST https://copa-copilot-api-ktdjm6xcyq-uc.a.run.app/api/assistant/query \
  -H 'content-type: application/json' \
  -d '{"message":"What is the crowd like right now?","venueId":"metlife"}'
```

## Documentation map

| # | Section | What it covers |
|---|---------|----------------|
| 00 | [Introduction & Product Overview](./00-introduction.md) | What Copa Copilot is, the real-world problem it addresses, the four personas, and the eight operational dimensions. |
| 01 | [System Architecture](./01-architecture.md) | The monorepo, the three packages, the deterministic core, the request/response data flow, and the error model. |
| 02 | [Feature Catalogue](./02-features.md) | Every user-facing feature, organized by persona and operational dimension, with the engine that powers each. |
| 03 | [AI Assistant & Grounding Design](./03-ai-assistant.md) | The tools-first assistant, Gemini via the llm-service proxy, the prompt-injection boundary, and the deterministic fallback. |
| 04 | [Code Quality & Engineering Standards](./04-code-quality.md) | Determinism, the single schema source, data-driven dispatch, typing discipline, the styling system, and automated hygiene gates. |
| 05 | [Testing Strategy](./05-testing.md) | The test layers, their counts, coverage gates, and what each layer proves. |
| 06 | [Security](./06-security.md) | The STRIDE-lite threat model, the defence-in-depth layers, secret management, and responsible-AI controls. |
| 07 | [Accessibility](./07-accessibility.md) | WCAG conformance, the in-app accessibility settings panel, the evidence-as-code catalogue, and inclusive engine behaviour. |
| 08 | [Google Cloud & Gemini Integration](./08-google-cloud.md) | The Google services in use, how each is integrated, and the evidence-as-code service catalogue. |
| 09 | [Deployment & Operations](./09-deployment.md) | Build and deploy to Cloud Run, the CI pipeline, configuration, secret handling, and observability. |
| 10 | [API Reference](./10-api-reference.md) | The REST endpoints, request/response contracts, error codes, and rate limits. |
| 11 | [Domain Model & Determinism](./11-domain-model.md) | The domain concepts — venues, zones, scenarios, seeds — and how deterministic simulation produces reproducible results. |

## Suggested reading paths

- **New to the product?** Read [00 — Introduction](./00-introduction.md), then
  [02 — Feature Catalogue](./02-features.md).
- **Engineer joining the codebase?** Read [01 — Architecture](./01-architecture.md),
  [11 — Domain Model](./11-domain-model.md), and
  [04 — Code Quality](./04-code-quality.md).
- **Integrating with the API?** Read [10 — API Reference](./10-api-reference.md) and
  [03 — AI Assistant](./03-ai-assistant.md).
- **Reviewing security or accessibility?** Read [06 — Security](./06-security.md) and
  [07 — Accessibility](./07-accessibility.md).
- **Operating the deployment?** Read [09 — Deployment & Operations](./09-deployment.md).

## Conventions

- All figures in this documentation are drawn from the codebase and are reproducible.
  Test counts, coverage percentages, service counts, and endpoint contracts are kept in
  sync with the source of truth in the repository root (`TESTING.md`, `SECURITY.md`,
  `ACCESSIBILITY.md`, `GOOGLE_SERVICES.md`).
- Code identifiers are written as file paths (`packages/core/src/crowd.ts`) or symbol
  names (`simulateVenue`) so they can be located directly in the repository.
