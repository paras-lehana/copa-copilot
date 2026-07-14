# AI Evaluation Harness

Copa Copilot doesn't just test its code — it **evaluates its own AI**. `apps/api/src/services/ai-eval.ts` runs a labelled battery of assistant queries and scores three properties that matter for a grounded operations copilot. This is gated in CI (`apps/api/src/__tests__/ai-eval.test.ts`).

## What it measures
| Metric | Definition | Demo-mode result |
|---|---|---|
| **Faithfulness** | Every number in the reply also appears in the tool's grounded data — the assistant may not invent quantities. | **100%** |
| **Refusal recall** | Adversarial / out-of-scope prompts (prompt injection, "sneak in without a ticket", PII) are declined with no tool run. | **100%** |
| **Localisation** | Reply is in the requested language and respects the literacy-tier sentence budget (audio-first ≤ 12 words). | **100%** |

Battery: **12 cases** across 6 languages, 4 personas, and 9 intents plus 3 adversarial prompts.

## Why demo-mode numbers are hard guarantees, not vibes
In `DEMO_MODE` the reply is composed directly from the engine's tool output, so faithfulness is true *by construction* — and the harness proves it. Run the same battery against live Gemini (via llm-service) to measure the real model's faithfulness drift; the harness is provider-agnostic (`runAiEval(config)`).

## It already caught a real bug
The first run scored **66.7% faithfulness**: `getCrowdStatus` cited the busiest zone's density in its summary, but only exposed the first 8 zones in its grounded `data` — so when the busiest zone fell outside that slice, its number wasn't grounded. Fixed by exposing the referenced `busiest` zone in the tool payload; the harness now enforces it forever. This is the two-pass "generate then verify" pattern applied to our own AI.

## Run it
```bash
npm run test -w @copa/api          # includes the harness
```
