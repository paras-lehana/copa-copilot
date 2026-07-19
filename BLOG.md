# Building Copa Copilot: a grounded GenAI copilot for FIFA World Cup 2026 stadiums

> Technical blog for **PromptWars (Hack2skill × Google)** — Challenge: *Smart Stadiums & Tournament Operations*.
> Live: [web](https://copa-copilot-web-767171449038.us-central1.run.app) · [API](https://copa-copilot-api-767171449038.us-central1.run.app/api/meta) · [repo](https://github.com/paras-lehana/copa-copilot)

## The problem I chose to solve

The 2026 World Cup was the most technically advanced ever — Lenovo digital twins of all 16 venues, biometric entry, AI officiating — and yet the failures fans actually felt were *operational*, not technological:

- Fans **stranded ~3 hours** after Brazil–Morocco at MetLife because transit couldn't clear the crowd.
- At Arrowhead, only **2 of 7 gates** opened; people abandoned cars and walked over a mile to kickoff.
- **First-ever mandatory heat/hydration breaks** across matches; wet-bulb temps beat Qatar's winter Cup.
- A dynamic-pricing ticketing scandal (finals up to **$11,000**, a multi-state probe) and "ghost ticket" resale denials at the gate.
- A footprint estimated at **7.8 Mt CO₂e**, ~88% from transit — invisible to fans.

Every incumbent tool is either a ticket-wallet-plus-static-map (fan side) or a control-room dashboard (ops side). **Nobody gives the individual fan, volunteer, organizer, or accessibility-staffer a context-aware GenAI copilot.** That gap is Copa Copilot.

## The idea: a reasoning layer on a deterministic twin

Copa Copilot pairs a **pure, deterministic simulation engine** with a **Gemini assistant that can only speak in terms of that engine's data**. The engine (`@copa/core`) models all 16 venues: crowd/queue/transit simulation, crowd- and accessibility-aware routing, an exit-wave advisor (the anti-MetLife feature), a weather-protocol state machine (the 8-mile lightning rule + heat tiers), incident triage, entry-readiness, emissions, gamification, and leaderboards.

The engine has **no `Date.now()` and no `Math.random()`** — time and seed are parameters. That one decision is why every number the UI shows is reproducible in a unit test, why the demo is identical on every machine, and why the AI can be held to the truth.

## Prompt strategy: tools first, model second

User text never reaches the engine directly. An intent router picks a **tool** (`findSafeRoute`, `getExitAdvice`, `getWeatherProtocol`, …); the tool calls the engine with typed arguments; the reply is composed **from the tool's output**. In live mode, Gemini only *rephrases* a `VERIFIED_STADIUM_DATA` block in the user's language and register. Consequences:

- A hallucinated quantity is structurally hard — the model is handed the numbers.
- Demo and live modes agree on every number (same tool output).
- User input is fenced with a **per-request nonce** (`### USER_INPUT <nonce> …`), and the system prompt says to treat anything inside the fence as data. A 10-prompt injection red team confirms exfiltration/override attempts are declined.

## The part I'm proudest of: evals for the AI itself

Code tests aren't enough for a GenAI app, so Copa Copilot **evaluates its own assistant**. A harness runs a labelled battery (12 cases across 6 languages, 4 personas, 9 intents + 3 adversarial prompts) and scores three properties, gated in CI:

- **Faithfulness** — every number in the reply appears in the grounded tool data (100%).
- **Refusal recall** — adversarial/out-of-scope prompts are declined (100%).
- **Localisation** — right language, sentence budget respected (100%).

It earned its keep immediately: the first run scored **66.7% faithfulness** because `getCrowdStatus` cited the busiest zone but only exposed the first 8 zones in its grounded payload — so a number could be "real" yet ungrounded. I fixed the tool to expose the referenced zone; the harness now enforces it forever. That's the generate-then-verify pattern applied to my own AI.

## Google services

AI inference is routed through an **llm-service proxy** reaching **Gemini `gemini-3-flash`** — never a direct provider call (a cost/security discipline). The key is a service-to-service header held in **Secret Manager**. Delivery is **Cloud Build → Artifact Registry → Cloud Run** (`us-central1`), with **Cloud Logging** for structured logs. Maps, Routes, Cloud Translation, Text-to-Speech and GA4 are wired as `ready-with-key` with honest fallbacks; Firebase/Firestore/BigQuery/Pub-Sub are catalogued as `planned`. The whole catalog is **evidence-as-code**: a typed registry served at `/api/google/services` and rendered at `/google-services`, with tests that enforce honesty invariants (an `implemented` claim must have real code paths) and that no env value ever leaks.

## Engineering standard

TypeScript strict everywhere; a `Result<T, AppError>` channel so the core never throws across boundaries; one shared zod schema source for API and web; ESLint over every workspace; a grep-census that keeps the tree free of `any`/`console.log`/`TODO`/`eslint-disable`. **1,516 unit/integration/component tests** (99.4% core coverage) plus **52 Playwright + axe** runs — accessibility verified on all 10 routes in **light and dark** (WCAG 2.1 AA, ARIA meters, keyboard-complete, RTL Arabic). It all runs with **zero API keys** in demo mode.

## Try it in 30 seconds

Open the [live dashboard](https://copa-copilot-web-767171449038.us-central1.run.app), tap **"Get my exit advice"**, then ask the assistant *"wheelchair route to my seat"* — the reply is real Gemini, and every number in it came from the engine.

## What's next

Real-time SSE crowd streaming, voice + Cloud TTS, offline PWA caching for congested stadium networks, and flipping Firestore/Maps from `ready-with-key` to `implemented`. The interfaces already exist — see `SUGGESTIONS.md`.

*Built with Google Antigravity for PromptWars.*
