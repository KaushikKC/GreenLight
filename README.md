# Greenlight

**The pre-flight check for creator ads.** Upload a draft and get a timestamped report on whether it's ready to run as a paid creator ad, plus a Rights Wallet for your deal contracts and warm, evidence-backed pitches to brands you already love.

Every flag shows **evidence** (a timestamp, frame, quote or contract clause) and a **concrete fix**. No vague AI verdicts.

## What it does

| | |
|---|---|
| **Preflight** | Scores a draft video 0–100 (Ready / Fix first / Not ready): hook, 9:16 format, platform safe zones, captions, text size, brief points and don'ts, CTA, risky claims, ad disclosure, loudness, music, blur and lighting. Video player with issue markers, a safe-zone phone overlay, a numbered fix list, a read-only share link and re-check diffs ("5 issues fixed, 2 remaining"). |
| **Rights Wallet** | Paste or upload a contract (PDF/DOCX). Terms are extracted with the exact source quote for each, the creator confirms them side by side with the contract (relative dates are never guessed), and the wallet shows a usage / whitelisting / exclusivity timeline, alerts, a "Can I take this deal?" exclusivity checker and an `.ics` export. *Greenlight organises your contracts; it isn't legal advice.* |
| **Brands You Already Love** | Import your own posts (paste or CSV, no scraping), find the brands you mention organically, rank them by a recency-weighted love score, keep sponsored-only brands apart as past partners, and draft a short pitch that only cites your real posts. Greenlight never sends anything. |

## Why I built this for Tano

- **Fewer revision rounds.** Tano reviews creator content before it becomes an ad. Preflight catches what a reviewer would send back (text under the caption bar, missing brief points, no #ad) before the draft is submitted.
- **Rights creators understand.** Usage and whitelisting are in every deal. The Rights Wallet turns contract language into dates and clear alerts, so micro-creators can grant rights with confidence.
- **Warm rebriefs, grounded in real use.** Pitches only reference posts where the creator genuinely used the brand, which keeps creators from becoming "walking billboards".

## Architecture

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│  apps/web  (Next.js, TS) │        │ services/analyzer (Python)    │
│  UI, route handlers,     │        │ worker polling the jobs table │
│  presigned uploads,      │        │ ffmpeg · OpenCV · PySceneDetect│
│  Drizzle, rate limits    │        │ faster-whisper · RapidOCR     │
└────────────┬─────────────┘        │ LLM: Anthropic or Gemini      │
             │                      └──────────────┬────────────────┘
             │        ┌──────────────┐             │
             ├───────▶│  Postgres    │◀────────────┤  jobs table = queue
             │        └──────────────┘             │  (FOR UPDATE SKIP LOCKED)
             │        ┌──────────────┐             │
             └───────▶│ S3 / MinIO   │◀────────────┘  videos, frames, contracts
                      └──────────────┘
```

- **Queue:** a Postgres `jobs` table claimed with `FOR UPDATE SKIP LOCKED`, with retries, backoff, provider-suggested waits for rate limits, and recovery of stale jobs. No Redis.
- **LLM output:** structured and validated with Pydantic, with one retry and then "couldn't check". Every call is logged to `llm_calls` with tokens, cost and latency. Prompts are versioned (`preflight_v2`, `contract_v1`, `pitch_v1`, …).
- **Providers:** Anthropic (strict tool use) or Google Gemini (JSON-schema mode, free-tier model fallbacks), picked from env. A `replay` provider serves saved answers for tests and demos.
- **Rules are data:** safe zones, thresholds, categories, brand aliases and rate limits live in `services/analyzer/rules/*.json`, shared by the worker and the web app.
- **Privacy:** storage is private with signed URLs; videos and frames are auto-deleted after 7 days while the report text is kept.

## Evals

`services/analyzer/evals/` holds synthetic golden sets: 18 generated clips with expected check statuses, 8 contracts with expected fields and planted red flags, and 50 labelled captions. Run them with `make eval` (Preflight, free) or `make eval SUITE=all` (uses the LLM). Latest results are in [`services/analyzer/evals/results/`](services/analyzer/evals/results/).

<!-- eval-table:start -->
| Suite | Headline | Detail |
|---|---|---|
| Preflight (18 clips, AI off) | 100% status accuracy | 37 labelled checks · flagged precision 100% · recall 100% · p50 4.0s/clip |
| Contracts (8) | _pending_ | |
| Brands (50 captions) | _pending_ | |
<!-- eval-table:end -->

The golden sets are synthetic, so real footage and real contracts will be harder. Building the sets surfaced a real bug: VAD mistook music for speech. The music check now counts "speech" that Whisper can't transcribe as music.

## Run it locally

Requirements: Docker, Node 24 (`nvm use`), pnpm (via corepack), [uv](https://docs.astral.sh/uv/), ffmpeg.

```bash
cp .env.example .env      # add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY
make install
make dev                  # Postgres + MinIO, migrations, web on :3000, worker
```

```bash
make test                 # vitest + pytest
make lint                 # eslint, tsc, ruff
make e2e                  # Playwright happy paths at 390px (replay LLM, no key needed)
make eval                 # Preflight eval (free); SUITE=all for the LLM suites
```

## What I'd build next

- Official Instagram Graph / TikTok Display API import (OAuth + app review) instead of paste/CSV.
- A brand-side view of Preflight reports, so agencies can approve drafts in the same place.
- A webhook to an account manager's Slack when a draft goes from "Fix first" to "Ready".
- Real-footage golden sets and threshold tuning (every `TODO_VERIFY` in `rules/platforms.json`).
- An MCP server exposing Preflight, contract extraction and the exclusivity checker (Phase 7).
