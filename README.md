# JTown Exit Copilot

An AI coach and dashboard that helps the owner of JTown Hot Yoga (three studios) get the business ready to sell for the best price, step by step.

- **Talk or type.** A voice-first "Exit Coach" (Claude) interviews the owner like a good M&A advisor: goals, studios, money, members, staff, leases. It records every answer as it goes, so the dashboard fills in during the conversation. Hands-free mode lets her talk back and forth without touching the screen.
- **Upload documents.** Tax returns, P&Ls, bank statements, leases and Mindbody/Momence reports (PDF, photo or CSV). Claude reads the document and proposes numbers with the line it took each one from, plus possible add-backs and buyer red flags. Nothing is saved until she checks it.
- **See the value.** The estimated sale value (as a range), how the price is built (revenue → SDE → adjusted EBITDA), likely buyer type, an exit-readiness score, and per-studio KPIs against benchmarks.
- **Know what to do.** "What each improvement is worth" ranks the levers (clean books, GM, churn, pricing, utilization, leases, W-2 cleanup…) by dollars of sale value. A four-phase roadmap (clean up → grow → package → sell) has personalized tasks the coach adds and checks off with her.
- **Ask what anything means.** Every metric has a "?" with a plain-English explanation and an "Ask my coach about my number" button.

## Run it

### Hosted (Render)

`render.yaml` defines the service: build `npm ci && npm run build`, start `npm start`, health check `/api/health`. In the Render dashboard, set `ANTHROPIC_API_KEY` and `APP_PASSCODE` under **Environment**. On the free plan the service sleeps when idle, so the first visit after a break takes about a minute. The Starter plan keeps it always on.

### Locally

```bash
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY
npm run dev               # http://localhost:3001
```

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude API key for the coach and document reader |
| `APP_PASSCODE` | recommended | Shared passcode, asked once per device |
| `COACH_MODEL` | no | Defaults to `claude-opus-5-5` |
| `COACH_EFFORT` | no | `low` gives snappier voice replies, `high` deeper analysis (default `medium`) |
| `PORT` | no | Default `3001` |

Other scripts: `npm test` (valuation engine tests) and `npm run lint` (typecheck).

## How it works

```
Browser (React)                               Server (Express)                 Claude API
─────────────────                             ────────────────                 ──────────
state in localStorage ──POST /api/chat───────▶ runCoach(): streaming tool loop ─▶ claude-opus-5-5
  ◀── SSE: text / state / view events ───────  tools mutate a copy of state        system prompt (cached)
                                               + snapshot of computed valuation     + <snapshot> each turn
file ──POST /api/extract─────────────────────▶ structured-output extraction ───▶ PDF / image / CSV
  ◀── proposed updates (she approves) ───────
Web Speech API: mic → text, replies → speech (sentence by sentence)
```

- **`src/lib/valuation.ts`**: the deterministic engine. Computes SDE, adjusted EBITDA (after the cost of replacing the owner), buyer type, multiple, value range, readiness factors, missing inputs and lever impacts. The coach is told never to do its own valuation math: it quotes this engine via a snapshot sent each turn, so the chat and the dashboard always agree. All rules of thumb live in `BENCHMARKS` at the top of the file.
- **`src/lib/profileUpdates.ts`**: one registry of every profile field. The tool schema, the document extractor, and the manual edit forms all write through the same validation.
- **`server/coach.ts`**: system prompt, tools (`update_profile`, `add_action_items`, `set_action_status`, `show_view`, `finish_onboarding`) and the streaming tool-use loop. Server-side refusal fallbacks (`fallbacks: "default"`) are enabled, so a policy decline is retried on a fallback model instead of ending the turn.
- **`server/extract.ts`**: document reader using structured outputs.

### Valuation model (planning estimate, not an appraisal)

- Owner-operator buyers pay ~1.8–3.5× **SDE**. Regional operators, franchisors and search funds pay ~3–5.5× **adjusted EBITDA**. PE-backed platforms pay ~4.5–7× for multi-unit businesses with ~$1.2M+ EBITDA. The model blends smoothly between these by size, so crossing a threshold never produces a cliff.
- The readiness score (0–100) sets where in the range the business lands.
- Lever impacts re-run the whole model on a modified copy of the profile, so they include both the earnings effect and the multiple effect. Revenue gains are capped (10% per lever, 25% for the full plan), so treat "plan potential" as an upper bound.

These ranges come from published broker and advisor rules of thumb for boutique fitness, which disagree with each other. Have a broker or valuation firm validate them against current comparable sales before pricing a deal.

## Privacy

- The owner's numbers, roadmap and conversation are stored **only in her browser** (localStorage). Use ••• → *Download a backup* to keep a copy or move devices.
- Uploaded documents go to the Claude API to be read and are **not stored** by this app. Only the numbers she approves are kept.
- Voice recognition uses the browser's built-in speech service (Chrome, Edge, Safari). Reading replies aloud uses on-device speech synthesis.

## Limitations / next steps

- Single-user by design (no accounts). For several devices or an advisor login, add auth and a database (e.g. Supabase) in place of localStorage.
- Browser voices vary in quality. A premium text-to-speech service could replace `SentenceSpeaker` in `src/lib/voice.ts`.
- Excel files must be saved as PDF/CSV first.
- Educational planning tool, not financial, tax or legal advice.
