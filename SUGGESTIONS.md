# Suggestions & Roadmap

Ideas beyond the current release, each with *why it helps* — for reviewers gauging vision, and for the next iteration.

| # | Idea | Why it helps | Effort |
|---|---|---|---|
| 1 | **Real-time SSE crowd stream on the dashboard** (endpoint exists at `/api/crowd/:id/stream`) — animate density live instead of on the minute-scrubber | Judges remember products that feel alive; proves the streaming architecture, not just request/response | S |
| 2 | **Voice input + Cloud TTS output** for the assistant (Web Speech in, `ready-with-key` TTS out) | Accessibility + multimodal differentiator; audio-first mode already caps sentences to 12 words | M |
| 3 | **PWA / offline** — service worker caching the venue graph + last snapshot so wayfinding works when the stadium network drops | Directly answers the documented 2026 connectivity strain; strong "practical usability" signal | M |
| 4 | **Grounding citations in assistant replies** — surface which tool + which zone densities backed each answer as inline chips | Reinforces "no hallucinated numbers"; a trust/Responsible-AI signal | S |
| 5 | **AI-evaluation harness** — a small suite that scores the assistant's answers against the engine's ground truth (does it ever contradict a tool result?) | Novel: the app tests its own AI, not just its code | M |
| 6 | **Firestore persistence** behind the existing `UserStore` interface — durable profiles + leaderboards across sessions | Turns two `planned` Google services into `implemented`; the seam already exists | M |
| 7 | **Google Maps perimeter widget** live (station↔gate) once a Maps key is added | Flips a `ready-with-key` service to `implemented`; the fallback panel already ships | S |
| 8 | **Multi-venue live switching in the UI** with per-venue graphs (all 16 already modelled in core) | Shows tournament-wide scope vs single-venue competitors | S |
| 9 | **Incident → dispatch timeline** view for organizers (triage → dispatched → resolved with ETAs) | Deepens the operational-intelligence story | M |
| 10 | **Sponsor/CO₂ report export** (the 7.8 Mt CO₂e tournament framing) as a shareable summary | Ties sustainability to a stakeholder deliverable | S |

Effort key: S ≈ hours, M ≈ a day. Every item builds on an interface or endpoint that already exists — none require re-architecting.
