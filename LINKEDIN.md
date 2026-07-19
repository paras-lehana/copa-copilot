# LinkedIn "Build-in-Public" post (ready to publish)

> Paste into LinkedIn. Attach 2–3 screenshots from `apps/web/public/screenshots/` and the live link. Hashtags included.

---

🏟️ I built **Copa Copilot** for PromptWars (Hack2skill × Google) — a GenAI copilot for FIFA World Cup 2026 stadium operations. Live, deployed, and it evaluates its own AI.

The 2026 World Cup had the best stadium *tech* ever — and the failures fans felt were operational: a ~3-hour transport strand at MetLife, only 2 of 7 gates open at Arrowhead, mandatory heat breaks, an $11,000-ticket pricing scandal. Incumbent apps are ticket-wallets or control-room dashboards. Nobody gives the *individual* fan, volunteer, or organizer a context-aware copilot.

So I built one. What makes it different:

🧠 **Grounded, not guessing.** A pure deterministic engine (no clocks, no randomness) simulates all 16 venues. The Gemini assistant can only rephrase the engine's real numbers — so it can't invent a queue time.

✅ **It tests its own AI.** An evaluation harness scores the assistant on faithfulness, refusal recall, and localisation — 100%, gated in CI. It caught a real grounding bug on its first run and now prevents it forever.

🔒 **Engineered to a bar.** 1,516 tests (99.4% core coverage) + 52 Playwright/axe runs, accessibility on every route in light AND dark, WCAG 2.1 AA, 6 languages incl. RTL Arabic. Zero API keys needed to run it.

☁️ **Google-native.** Gemini via a secure llm-service proxy, Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Cloud Logging — with an evidence-as-code service catalog served live at `/google-services`.

Try it 👉 https://copa-copilot-web-767171449038.us-central1.run.app
Tap "Get my exit advice", then ask *"wheelchair route to my seat"*.

Built with Google Antigravity. Full write-up + repo in comments.

\#PromptWars #BuildWithAI #GoogleCloud #Gemini #GenAI #FIFAWorldCup2026 #SmartStadiums #TypeScript #Accessibility

---

**First comment (drop the links):**
Technical blog: <link> · Repo: https://github.com/paras-lehana/copa-copilot · Live API: https://copa-copilot-api-767171449038.us-central1.run.app/api/meta
