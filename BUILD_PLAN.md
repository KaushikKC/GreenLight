# Greenlight — Build Plan

> The pre-flight check for creator ads. Creators upload a draft video and get an instant, timestamped report on whether it's ready to run as a paid creator ad, plus two companion tools: a **Rights Wallet** for their deal contracts and **Brands You Already Love** for warm, evidence-backed pitches.

This file is the source of truth for Claude Code. Build it phase by phase (Section 10). Don't jump ahead.

---

## 1. Why this exists (context for design decisions)

This is a portfolio project built to show fit with Tano (tano.ai), a London AI-native creator marketing company. What we know about them, and how each point shapes this product:

| Tano signal | What it means for this build |
|---|---|
| They review and approve creator content before delivering ad-ready assets to brands | Preflight cuts revision rounds. That's the core value. |
| They're going "all in on micro-creators" | Users are small creators with no manager. The UI must be simple and work well on mobile. |
| Their team talks about building "the best agentic creator UX" | This is a creator-side tool, not a brand dashboard. |
| Whitelisting and usage rights are part of every deal | The Rights Wallet makes creators comfortable granting rights. |
| Warm rebriefing reportedly converts far better than cold outreach | Brands You Already Love turns organic history into warm pitches. |
| CEO worries creators become "walking billboards" | Pitches must be grounded in genuine past use, never invented. |
| They publish an MCP server, A2A card and llms.txt | Bonus phase: expose our tools over MCP. |
| Stack in their job ad: TypeScript, Python, Next.js, AWS/GCP | Use the same stack. |

**Guiding principle:** every flag the product raises must show *evidence* (timestamp, frame, quote, or contract clause) and a *concrete fix*. No vague AI verdicts.

---

## 2. Scope

### In scope (MVP)
1. **Preflight** (core): video upload, analysis pipeline, scored report with timestamps, safe-zone overlay, and fix list.
2. **Rights Wallet**: contract upload, AI extraction with source quotes, human confirmation, timeline, conflict and expiry alerts, and .ics export.
3. **Brands You Already Love**: post import (manual or export file), brand-mention extraction, ranking, and pitch drafting.
4. An eval harness for the AI checks.
5. Bonus: an MCP server exposing the three tools.

### Out of scope (explicitly)
- Scraping TikTok or Instagram. It breaks their terms of service. Use user-provided data only, with official APIs as a later phase.
- Sending emails or pitches automatically. The creator always sends them.
- Legal advice. The Rights Wallet is an organiser, not a lawyer.
- Payments and affiliate tracking.

---

## 3. Architecture

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│  apps/web  (Next.js, TS) │        │ services/analyzer (Python)    │
│  - UI (App Router)       │        │ - FastAPI (health, internal)  │
│  - Route handlers (API)  │        │ - Worker: polls jobs table    │
│  - Presigned uploads     │        │ - ffmpeg / OpenCV / OCR       │
│  - Drizzle ORM           │        │ - faster-whisper transcripts  │
└────────────┬─────────────┘        │ - Anthropic SDK (vision/JSON) │
             │                      └──────────────┬────────────────┘
             │        ┌──────────────┐             │
             ├───────▶│  Postgres    │◀────────────┤  (jobs table = queue)
             │        └──────────────┘             │
             │        ┌──────────────┐             │
             └───────▶│ S3 / MinIO   │◀────────────┘  (videos, frames, contracts)
                      └──────────────┘
┌──────────────────────────┐
│ apps/mcp (TS, bonus)     │ → calls web API
└──────────────────────────┘
```

**Decisions:**
- **Queue.** Use a Postgres `jobs` table with `SELECT … FOR UPDATE SKIP LOCKED`. This avoids running Redis. The worker polls every 1–2 seconds.
- **Uploads.** The browser uploads directly to S3 or MinIO with a presigned PUT URL. Next.js never streams video.
- **Web to worker communication.** Web inserts a job row. The worker writes results to the DB. Web polls `GET /api/preflight/:id` every 2 seconds (Server-Sent Events are optional later).
- **Local dev.** `docker compose up` starts postgres, minio, and the analyzer. Web runs with `pnpm dev`.
- **Deploy.** Web goes on Vercel. The analyzer goes on Fly.io, Railway or AWS App Runner, since it needs a container with ffmpeg. The database is Neon or Supabase Postgres. Storage is S3 or Cloudflare R2.

### Repo layout
```
greenlight/
  CLAUDE.md
  docs/BUILD_PLAN.md          ← this file
  docker-compose.yml
  .env.example
  apps/
    web/                      Next.js + TS + Tailwind + shadcn/ui + Drizzle
    mcp/                      (Phase 7) MCP server, TypeScript SDK
  services/
    analyzer/
      pyproject.toml
      analyzer/
        worker.py             job loop
        jobs/preflight.py
        jobs/contract.py
        jobs/brands.py
        media/probe.py        ffprobe metadata
        media/frames.py       frame sampling
        media/audio.py        loudness, VAD, music heuristic
        media/ocr.py          on-screen text + boxes
        media/quality.py      blur, brightness, scene cuts
        llm/client.py         Anthropic wrapper (retries, cost logging)
        llm/prompts/*.md      versioned prompts
        checks/*.py           one file per check
        scoring.py
      rules/platforms.json    safe zones, format rules (editable)
      evals/                  golden set + runner
      tests/
```

---

## 4. Tech choices

| Concern | Choice | Note |
|---|---|---|
| Web | Next.js (latest stable, App Router), TypeScript strict, Tailwind, shadcn/ui | Build mobile-first |
| ORM | Drizzle + drizzle-kit migrations | Schema in `apps/web/db/schema.ts` |
| Auth | Auth.js with email magic link, plus a **guest mode** so reviewers can try it without signing up | |
| Validation | Zod on every API boundary | Share types via generated JSON Schema |
| Worker | Python 3.11+, `uv` for dependencies | |
| Media | ffmpeg/ffprobe, OpenCV, PySceneDetect | |
| Transcription | `faster-whisper` (small model, word timestamps) running locally | No extra API key |
| OCR | RapidOCR (onnxruntime) | Lightweight, gives bounding boxes |
| Speech detection | `webrtcvad` | Used for the music heuristic |
| LLM | Anthropic API via the official Python SDK | Models come from env vars (see below) |
| PDF/DOCX text | `pdfplumber`, `python-docx`. For scanned PDFs, send the PDF directly to Claude as a document | |
| Tests | Vitest (web), pytest (analyzer), Playwright (one happy path per feature) | |

**LLM configuration (env):**
```
ANTHROPIC_API_KEY=
MODEL_VISION=claude-sonnet-5            # frame + brief analysis, contract extraction
MODEL_FAST=claude-haiku-4-5-20251001    # per-post brand mention classification
```
Check docs.claude.com for current model names before building. Always get structured output through **tool use with a JSON schema**, and validate it with Pydantic. Retry once on a validation failure, then mark the check as `error`. Log input tokens, output tokens, cost and latency for every call in `llm_calls`.

---

## 5. Data model (Drizzle / Postgres)

```ts
users            (id, email, name, is_guest, created_at)

jobs             (id, type: 'preflight'|'contract'|'brands_scan'|'pitch',
                  ref_id, status: 'queued'|'running'|'done'|'error',
                  attempts, locked_at, run_after, error, created_at, updated_at)

llm_calls        (id, job_id, model, purpose, input_tokens, output_tokens,
                  cost_usd, latency_ms, created_at)

-- Preflight
videos           (id, user_id, storage_key, filename, size_bytes,
                  duration_s, width, height, fps, has_audio, created_at,
                  delete_after)                         -- auto-delete after 7 days
preflights       (id, user_id, video_id, platform: 'tiktok'|'reels'|'both',
                  brief_text, caption_text, brand_name, status,
                  score int, verdict: 'ready'|'fix_first'|'not_ready',
                  report jsonb, artifacts jsonb,        -- frame urls, transcript
                  prompt_version, created_at)

-- Rights Wallet
contracts        (id, user_id, storage_key, source: 'pdf'|'docx'|'text',
                  raw_text, extracted jsonb, status:
                  'extracting'|'needs_review'|'confirmed', created_at)
deals            (id, user_id, contract_id, brand, campaign, signed_at,
                  fee_amount, fee_currency, payment_terms_days, payment_due_at,
                  paid bool, deliverables jsonb, notes)
rights_windows   (id, deal_id, kind: 'usage'|'whitelisting'|'exclusivity',
                  platforms text[], territories text[], category text,
                  starts_at, ends_at, perpetual bool, source_quote text)

-- Brands You Already Love
posts            (id, user_id, platform, url, posted_at, caption,
                  transcript, ocr_text, source: 'manual'|'csv'|'export'|'upload')
brand_mentions   (id, post_id, brand_canonical, brand_raw, product,
                  modality: 'spoken'|'caption'|'on_screen'|'visual',
                  sentiment: -1..1, is_sponsored bool, evidence text,
                  confidence real)
pitches          (id, user_id, brand_canonical, subject, body,
                  evidence_post_ids uuid[], created_at)
```

---

## 6. Feature 1: Preflight (core product)

### 6.1 User flow
1. `/preflight/new`: the creator drags in a video (MP4/MOV, 200 MB max, 3 min max). They pick a target (TikTok / Reels / Both). Optionally they paste the **brand brief**, their **planned caption**, and the brand name.
2. The upload goes to S3, a job is queued, and the user is redirected to `/preflight/[id]`.
3. The progress screen shows live steps: "Reading video → Transcribing → Checking hook → Checking safe zones → Checking brief → Scoring". These come from `report.progress` updated by the worker.
4. The report screen shows:
   - A **score dial** (0–100) and a verdict chip (Ready / Fix first / Not ready).
   - A **video player** with coloured markers on the timeline at each issue's timestamp. Clicking a marker seeks to it.
   - A **phone-frame overlay toggle** that draws the platform UI safe zones over the video and highlights any OCR text boxes that fall inside them in red.
   - The **checklist**, grouped as Hook · Format · Readability · Message · Compliance · Audio · Technical. Each check shows its status, evidence (thumbnail or quote), and a fix.
   - A **"Fix list"** of numbered, copyable action items, sorted by impact.
   - A **Share report** link (read-only public URL) so the creator can send it to the brand or agency.
   - A **Re-check** button: upload v2 and see a diff ("3 issues fixed, 1 remaining").

### 6.2 Pipeline (worker `jobs/preflight.py`)
```
1. probe        ffprobe → duration, w, h, fps, rotation, audio stream
2. frames       - first 3s at 2 fps (0.0,0.5,…,3.0)
                - then 1 frame per scene cut (PySceneDetect), max 12
                - final 2s at 1 fps
                - downscale to 768px long edge, JPEG q85, upload to S3
3. audio        extract 16 kHz mono wav
                - loudness: ffmpeg ebur128 → integrated LUFS, true peak
                - VAD: speech ratio over time
                - music heuristic: energetic non-speech segments ratio
4. transcript   faster-whisper → segments with word timestamps
5. ocr          RapidOCR on every sampled frame → text + boxes (normalised 0..1)
6. quality      blur (Laplacian var), brightness (mean luma), cuts in first 3s
7. llm_vision   one call to MODEL_VISION with the hook frames + transcript[0..3s]
                + brief + caption + a list of the other frames (labelled with timestamps)
                → structured JSON for the LLM-judged checks (6.3)
8. checks       run deterministic checks + merge LLM results
9. score        weighted score + verdict
10. persist     report jsonb, status=done
```
Each step updates `report.progress`. If a step fails, mark the affected checks as `error`. Don't fail the whole job unless probing fails.

### 6.3 Checks catalogue

`D` = deterministic, `L` = judged by the LLM, `H` = heuristic (always shown with an "estimate" label).

| ID | Group | Type | What it checks | Default thresholds |
|---|---|---|---|---|
| `format.aspect` | Format | D | Is the video vertical 9:16? | warn if not 9:16 ±2% |
| `format.resolution` | Format | D | Is it at least 1080×1920? | warn below 1080 wide, fail below 720 |
| `format.duration` | Format | D | Is the length suited to ads? | configurable; warn above 60s |
| `hook.visual_product` | Hook | L | Is the product or brand visible by 3s? | fail if not visible by 3s |
| `hook.spoken` | Hook | D+L | Does speech start by ~1.5s, and is the opening line a hook (question, bold claim, pattern interrupt)? | |
| `hook.text` | Hook | D+L | Is there on-screen text in the first 2s, and does it reinforce the hook? | |
| `hook.pacing` | Hook | D | Scene cuts or motion in the first 3s | info only |
| `read.safe_zone` | Readability | D | Do any OCR text boxes overlap the platform UI zones? | fail if key text overlaps |
| `read.captions` | Readability | D | Are there burned-in captions? (OCR text overlaps transcript words) | warn if none |
| `read.text_size` | Readability | D | OCR box height vs frame height | warn if too small to read on a phone |
| `msg.brief_points` | Message | L | Each required talking point from the brief: covered? where? | fail if a mandatory point is missing |
| `msg.brief_donts` | Message | L | Any "don'ts" from the brief broken (e.g. banned claims, competitors shown)? | fail |
| `msg.cta` | Message | D+L | Is there a clear call to action in speech or text in the last 5s? | warn if none |
| `msg.claims` | Message | L | Risky claims (medical, "cures", guaranteed results) | warn, with the quote |
| `comp.disclosure` | Compliance | D+L | Ad disclosure present in the caption (e.g. #ad) and/or on screen or spoken | fail if no disclosure anywhere |
| `audio.music` | Audio | H | Music detected → ask the creator whether it's original or commercially licensed | warn plus a question |
| `audio.loudness` | Audio | D | Integrated LUFS and clipping | warn outside the target range in config |
| `audio.voice_clarity` | Audio | H | Speech-to-music ratio during talking segments | warn |
| `tech.blur` | Technical | D | Blurry frames | warn |
| `tech.lighting` | Technical | D | Underexposed frames | warn |

**Important:** all numeric thresholds and all platform safe-zone boxes live in `services/analyzer/rules/platforms.json`. Seed that file with **placeholder values marked `"TODO_VERIFY"`**. The human will fill in values from the official TikTok and Meta creative specs. Never hard-code platform rules in Python.

```json
{
  "tiktok": {
    "safe_zones_note": "Fractions of frame (0..1). TODO_VERIFY against official TikTok ads creative specs.",
    "unsafe_regions": [
      {"name": "right_action_rail", "x": 0.85, "y": 0.35, "w": 0.15, "h": 0.45, "status": "TODO_VERIFY"},
      {"name": "bottom_caption_area", "x": 0.0, "y": 0.78, "w": 1.0, "h": 0.22, "status": "TODO_VERIFY"},
      {"name": "top_bar", "x": 0.0, "y": 0.0, "w": 1.0, "h": 0.08, "status": "TODO_VERIFY"}
    ],
    "duration_warn_s": 60,
    "loudness_lufs_range": [-18, -10]
  },
  "reels": { "...": "same shape, TODO_VERIFY" }
}
```

### 6.4 The LLM vision call
- **Input:** hook frames (0–3s) as images; up to 8 later frames as images, each labelled `t=12.4s`; the full transcript with timestamps; brief text; caption; brand name.
- **Output schema** (tool `record_preflight_judgements`):
```json
{
  "product_first_visible_s": 1.5,          // null if never
  "product_visibility_evidence": "string",
  "opening_line": "string",
  "hook_type": "question|bold_claim|pattern_interrupt|story|none",
  "hook_strength": 1,                      // 1-5
  "hook_reason": "string",
  "brief_points": [{"point": "string", "covered": true, "timestamp_s": 8.2, "quote": "string"}],
  "brief_violations": [{"rule": "string", "timestamp_s": 0, "evidence": "string"}],
  "cta": {"present": true, "timestamp_s": 27.0, "quote": "string"},
  "risky_claims": [{"quote": "string", "timestamp_s": 0, "why": "string"}],
  "spoken_disclosure": {"present": false, "timestamp_s": null}
}
```
- **Prompt rules:** judge only what is visible or audible. Every positive or negative judgement needs a timestamp or quote. If unsure, say so. Never invent brief requirements that aren't in the brief.
- Keep prompts in `llm/prompts/preflight_v1.md` and store `prompt_version` on every preflight.

### 6.5 Scoring
- Group weights: Hook 30, Message 20, Readability 15, Compliance 15, Format 10, Audio 5, Technical 5.
- Within a group: pass = full points, warn = half, fail = 0, na = excluded (redistribute its weight).
- **Hard caps:** any `comp.disclosure` fail or `msg.brief_donts` fail caps the score at 49.
- **Verdict:** ≥80 = Ready, 50–79 = Fix first, <50 = Not ready.
- Show a "why this score" breakdown. Never show a bare number.

### 6.6 Report JSON shape
```json
{
  "version": 1,
  "progress": [{"step": "transcribe", "status": "done"}],
  "score": 72,
  "verdict": "fix_first",
  "checks": [{
    "id": "read.safe_zone",
    "group": "readability",
    "status": "fail",
    "severity": "high",
    "timestamp_s": 4.0,
    "title": "Headline text is hidden behind TikTok's caption area",
    "explanation": "Your text 'Try it for 30 days' sits in the bottom 20% where TikTok shows the caption.",
    "evidence": {"frame_url": "…", "box": [0.1, 0.82, 0.8, 0.08]},
    "fix": "Move the text up to the middle third of the frame."
  }],
  "transcript": [{"start": 0.0, "end": 1.4, "text": "…"}],
  "meta": {"duration_s": 31.2, "width": 1080, "height": 1920}
}
```

---

## 7. Feature 2: Rights Wallet

### 7.1 User flow
1. `/rights/new`: upload a PDF or DOCX, or paste contract or email text.
2. Extraction runs as a job, then opens `/rights/[contractId]/review`: a **side-by-side view** with extracted fields on the left and the source document on the right. Clicking a field highlights its source quote.
3. The creator corrects anything wrong and clicks **Confirm**. This creates `deals` and `rights_windows`.
4. `/rights` is the wallet home:
   - A **timeline** (Gantt-style, one row per deal) with coloured bars for usage, whitelisting and exclusivity, and a "today" line.
   - **Alerts**: "Whitelisting for Brand X ends in 5 days", "Payment from Brand Y was due 12 days ago", "Exclusivity conflict: skincare with Brand A overlaps Brand B offer".
   - A **"Can I take this deal?" checker**: enter brand, category and dates, and the tool checks them against active exclusivity windows.
   - **Export .ics** with calendar reminders for every end date and payment due date.

### 7.2 Extraction
- Get text with pdfplumber or python-docx. If there's almost no text (a scanned PDF), send the PDF to Claude directly as a document block.
- Call MODEL_VISION with the tool `record_contract_terms`. Every field returns `{value, source_quote, confidence}`:
  - parties/brand, campaign, signed date
  - fee (amount, currency), payment terms (net days, trigger event)
  - deliverables `[ {platform, format, count, due_date} ]`
  - usage rights `[ {scope: organic|paid, platforms, territories, start, end, duration_text, perpetual} ]`
  - whitelisting / partnership-ad access `[ {platforms, start, end, duration_text} ]`
  - exclusivity `[ {category, competitors_named, start, end} ]`
  - revision rounds, raw-file delivery, termination / kill fee
  - **red flags** `[ {type, quote, why} ]`: perpetual or worldwide paid usage, unlimited revisions, payment >60 days, exclusivity longer than usage, rights to use likeness in AI or derivatives, and so on
- Relative dates ("for 90 days from first post") stay as `duration_text` plus a computed date the creator must confirm. Never silently guess a start date.

### 7.3 Deterministic logic (`apps/web/lib/rights.ts`, unit-tested)
- `activeWindows(date)`, `expiringWithin(days)`, `overduePayments(today)`
- `exclusivityConflicts(newOffer)`: category match uses a small taxonomy (skincare, haircare, supplements, food, fashion, tech, finance, …) plus LLM normalisation of free-text categories.
- A persistent footer on every Rights page: *"Greenlight organises your contracts; it isn't legal advice."*

---

## 8. Feature 3: Brands You Already Love

### 8.1 Getting the creator's posts (no scraping)
MVP import options, in order of effort:
1. **Paste** post URLs plus captions (one per line), or upload a **CSV** (`url, posted_at, caption`).
2. **Upload videos** directly. This reuses the Preflight media pipeline for transcript, OCR and frames.
3. **Platform data export file** (Instagram "Download your information" JSON, TikTok data download). Write a parser for each. The exact fields in these exports change, so the parser must be defensive and report which fields it found. *TODO_VERIFY with a real export.*
4. **Later phase:** the official Instagram Graph API and TikTok Display API with OAuth. Both need app review, so leave them out of the MVP.

### 8.2 Pipeline (`jobs/brands.py`)
1. For each post: caption, hashtags, @mentions, and transcript/OCR if a video was uploaded.
2. Call MODEL_FAST per post (batch 10 posts per call) with the tool `record_brand_mentions`: `brand_raw, product, modality, sentiment, is_sponsored` (detect #ad, "paid partnership", "gifted", "code X"), `evidence` (a quote), and `confidence`.
3. **Canonicalise** brands: lowercase, strip suffixes, match against an alias table, then an LLM merge pass over the distinct brand list ("The Ordinary" = "theordinary" = "@theordinary").
4. **Rank** with:
   `love_score = Σ organic mentions × recency_decay(90-day half-life) × (0.5 + sentiment/2) × modality_weight` (spoken 1.0, on_screen 0.8, caption 0.6, visual-only 0.5). **Exclude** brands where every mention is sponsored, and show those separately as "Past partners".
5. Show brand cards with love score, mention count, a sparkline of mentions over time, and evidence snippets that link to the posts.

### 8.3 Pitch drafting
- A "Draft pitch" button on a brand card calls MODEL_VISION with the evidence posts, the creator's niche and audience (from their profile settings), and an optional ask (gifting / paid post / affiliate).
- **Hard rules in the prompt:** only reference posts in the evidence list. No invented stats. No follower numbers unless the creator entered them. Under 150 words. Warm, specific and human.
- Output: subject plus body, and an **evidence panel** showing which posts each claim came from. The creator edits and copies it. We never send it.

---

## 9. Evals (this is what impresses an AI team)

`services/analyzer/evals/`:
- `preflight_golden/`: 15–20 short test videos you record yourself (good hook vs bad hook, text in the bottom zone, no disclosure, missing brief point, music-only, etc.). Pair each with `labels.json` holding the expected status per check.
- `contracts_golden/`: 8–10 synthetic contracts (write them yourself or have Claude write them) with expected extractions and planted red flags.
- `brands_golden/`: a CSV of ~50 fake captions with labelled mentions.
- `uv run python -m evals.run --suite preflight` prints per-check precision/recall, contract field accuracy, cost per run, and p50/p95 latency. It writes `evals/results/<date>.md`.
- Put a table of the latest eval results in the README.

---

## 10. Build phases (give Claude Code one phase at a time)

Each phase ends with passing tests, a commit, and an updated `docs/PROGRESS.md`.

**Phase 0: Scaffold (½ day)**
Monorepo, docker-compose (postgres, minio), Next.js app with Tailwind + shadcn, Drizzle schema + first migration, Python analyzer with uv, jobs table + worker loop that runs a no-op job end-to-end, `.env.example`, Makefile (`make dev`, `make test`, `make eval`).
✅ Done when: creating a dummy job in the UI shows it flip to `done`.

**Phase 1: Upload + deterministic Preflight (1.5 days)**
Presigned upload, video row, probe, frame sampling, audio loudness, OCR, blur/brightness, scene cuts, `rules/platforms.json`, format + readability + audio + technical checks, scoring, raw JSON report page.
✅ Done when: uploading a video yields a report with the deterministic checks and unit tests for each check.

**Phase 2: Transcription + LLM checks (1.5 days)**
faster-whisper, LLM client wrapper (tool-use JSON, Pydantic validation, retry, `llm_calls` logging), `preflight_v1.md` prompt, hook/message/compliance checks, merge + rescore.
✅ Done when: the brief-point and hook checks appear with timestamps, and cost per run is logged.

**Phase 3: Preflight UI (2 days)**
Progress screen, score dial, video player with timeline markers, safe-zone phone overlay toggle, grouped checklist, fix list, share link, re-check diff. Mobile-first. Read the frontend-design guidance and give it a distinctive look (not default shadcn grey).
✅ Done when: the Playwright happy path passes and it looks great on a 390px-wide screen.

**Phase 4: Rights Wallet (2 days)**
Upload/paste, extraction job, review screen with source highlighting, confirm → deals/windows, timeline, alerts, "Can I take this deal?", .ics export, unit tests for `rights.ts`.

**Phase 5: Brands You Already Love (1.5 days)**
Paste/CSV import (export parsers optional), mention extraction, canonicalisation, ranking, brand cards, pitch drafting with evidence panel.

**Phase 6: Evals + hardening (1 day)**
Golden sets, eval runner, results table in the README, error states, rate limiting on uploads, 7-day auto-delete of videos, guest-mode limits.

**Phase 7 (bonus): MCP server (½ day)**
`apps/mcp` using the TypeScript MCP SDK over Streamable HTTP. Tools: `run_preflight(video_url, platform, brief?, caption?)`, `get_preflight_report(id)`, `extract_contract_terms(text)`, `check_exclusivity(brand, category, start, end)`, `rank_loved_brands(posts[])`. Add an `llms.txt` at the web root describing the product, mirroring how Tano publishes theirs.

**Phase 8: Deploy + demo (½ day)**
Vercel + Fly/Railway + Neon + R2. Seed a demo account with a sample video, contract and posts, so reviewers see a full product in one click.

---

## 11. Non-functional requirements
- **Privacy:** videos auto-delete after 7 days. Contracts are private per user. All storage uses signed URLs. No training on user data. There's a clear delete-my-data button.
- **Cost:** target under $0.10 LLM cost per Preflight run (downscaled frames, capped frame count). Show cost in the admin panel.
- **Latency:** a 30s video should be fully analysed in under 60s on the deploy target.
- **Reliability:** a failed check shows "couldn't check" and never blocks the report.
- **Honesty in UI:** heuristic checks carry an "estimate" label. No legal or compliance guarantees.

---

## 12. README + demo (for the application)
- The README opens with a 1-line pitch, a GIF of the report screen, a "Why I built this for Tano" section (3 bullets linking features to their review step, rights and rebriefing), architecture diagram, eval results table, and what you'd build next (official API import, a brand-side view of Preflight reports, webhook to an account manager's Slack).
- **90-second Loom:** upload a bad draft → score 48 with a safe-zone fail and missing disclosure → fix it → re-check → 86 "Ready". Then 15 seconds each on Rights Wallet and Brands You Already Love, and finish on the eval table.
