# Progress

## Phase 2: Transcription + LLM checks 🟡 code complete, live LLM run pending (2026-09-22)

### Done
- **Transcription:** faster-whisper (`small`, int8, CPU, word timestamps, VAD filter). Model is downloaded on first use; Docker caches it in the `whisper-cache` volume.
- **LLM client** (`llm/client.py`): one strict tool (`strict: true`, schema generated from Pydantic with unsupported constraints stripped), `tool_choice: auto` + a check that the tool was called (forced tool choice 400s on some models, and models come from env). Pydantic validation; invalid/missing call is fed back and retried once, then `LLMError` → dependent checks show "couldn't check". Refusals aren't retried. Every call is logged to `llm_calls` (tokens incl. cache, USD cost, latency). System prompt is cache-marked.
- **Prompt:** `llm/prompts/preflight_v1.md`; `preflights.prompt_version` is set on every run.
- **Vision call:** all hook frames + up to 8 later frames (each labelled `t=…s`), timestamped transcript, OCR text, brand, brief, caption. Schema = BUILD_PLAN §6.4 + `product_identified`, `on_screen_hook`, `brief_points[].mandatory`.
- **New checks:** `hook.visual_product`, `hook.spoken` (timing + hook strength), `hook.text` (+ reinforcement judgement), `msg.brief_points`, `msg.brief_donts` (caps score), `msg.cta` (phrase match + LLM), `msg.claims`, `comp.disclosure` (caption/OCR/speech tags + LLM; caps score). `read.captions` now uses OCR-vs-transcript word overlap (VAD proxy remains as fallback, labelled estimate).
- **Rules:** hook timing, CTA phrases/window and disclosure tags/phrases live in `platforms.json`.
- **Report:** transcript segments; `meta.prompt_version`, `meta.llm_cost_usd`, `meta.llm_calls`, `meta.ai_review_error`.
- **Tests:** 164 pytest (fake Anthropic client for the wrapper and call builder, every new check, llm_calls DB logging, real whisper on a `say` clip) + 15 vitest.
- ✅ Verified end-to-end without an API key: transcript + deterministic halves run, LLM checks show "couldn't check", disclosure hard cap → 49 "Not ready".

### Remaining for Phase 2 sign-off
- Run once with a real `ANTHROPIC_API_KEY` to confirm brief-point/hook timestamps and the logged cost per run (target < $0.10).

### Known issues / decisions
- `comp.disclosure` with **no caption** provided and nothing on screen/spoken is a *warn*, not a fail (we can't see where #ad usually lives). With a caption and no disclosure anywhere it fails and caps the score.
- Brief checks are `na` without a brief, `error` if a brief was given but the AI step failed.
- Pricing table in `llm/pricing.py` is hand-maintained; unknown models log `cost_usd = NULL`.


## Phase 1: Upload + deterministic Preflight ✅ (2026-09-22)

### Done
- **Guest mode:** HMAC-signed httpOnly cookie → guest `users` row on first upload. Preflights are owner-scoped (others get 404).
- **Upload:** `POST /api/uploads` (presigned PUT, type/size validated) → browser uploads direct to MinIO → `POST /api/preflight` (key ownership + HEAD size check, then video + preflight + job in one transaction) → `GET /api/preflight/:id` (frame keys signed on the way out).
- **Rules:** `services/analyzer/rules/platforms.json` holds every threshold and safe zone (unverified ones listed in `_todo_verify` / `status: TODO_VERIFY`). "both" = union of zones + stricter limits. Web reads upload limits from the same file.
- **Pipeline** (`jobs/preflight.py`): probe → scene cuts + frames (hook @2fps, ≤12 cut frames, tail @1fps; 768px JPEG q85 to S3) → audio (EBU R128 loudness/true peak, VAD, music + voice-band heuristics) → OCR (RapidOCR, normalised boxes) → checks → score. Per-step progress in `report.progress`; a failed step only errors its dependent checks; unreadable/too-long videos fail permanently with a plain message.
- **Checks (13):** `format.aspect|resolution|duration`, `hook.pacing` (info), `hook.text` (deterministic half), `read.safe_zone|captions|text_size`, `audio.loudness|music|voice_clarity`, `tech.blur|lighting`. Heuristics carry `estimate: true`.
- **Scoring:** group weights, pass/warn/fail = 1/½/0, na/info/error excluded with weight redistributed, hard caps, verdict, "why this score" breakdown, impact-sorted fix list.
- **UI:** `/preflight/new` (mobile-first form, client-side size/duration pre-checks, upload progress) and `/preflight/[id]` (live progress, score, frame strip, raw JSON).
- **Tests:** 102 pytest (every check, scoring, report, rules, media units, synthetic-clip integration, DB queue) + 15 vitest.
- ✅ Verified in the browser: upload → report in ~3s for a 7s 1080×1920 clip. Safe-zone fail, loudness warn and captions detected as expected.

### Next: Phase 2 (Transcription + LLM checks)
faster-whisper, LLM client wrapper (tool use + Pydantic + retry + `llm_calls`), `preflight_v1.md`, hook/message/compliance checks, merge + rescore. Also upgrade `read.captions` to OCR-vs-transcript overlap and add the LLM half of `hook.text`.

### Known issues / decisions
- `message` and `compliance` groups have no checks until Phase 2, so scores are inflated for now (weights redistribute).
- `tech.blur` skips near-uniform frames (luma std < `blur_min_detail_std`) because Laplacian variance calls every flat text slide "blurry". Threshold is TODO_VERIFY on real footage (Phase 6 golden set).
- `read.captions` is a proxy (OCR text present during VAD speech) until transcripts land.
- `audio.music` / `voice_clarity` are rough heuristics; thresholds TODO_VERIFY.
- Auth.js magic link not wired yet; guest cookies are the only identity.
- `rapidocr_onnxruntime` pulls GUI OpenCV; a uv override keeps only `opencv-python-headless`. If `cv2` ever goes missing locally: `uv sync --reinstall-package opencv-python-headless`.
- Correction to Phase 0 notes: ffmpeg 8 was already installed on the host (the earlier check used the wrong flag).


## Phase 0: Scaffold ✅ (2026-09-22)

### Done
- pnpm monorepo (`apps/*`), Node 24 pinned via `.nvmrc`.
- `docker-compose.yml`: Postgres 16 (host port **5433**), MinIO (quay.io image) + bucket init. Containerised analyzer under `--profile full`.
- `apps/web`: Next.js 16 (App Router, strict TS), Tailwind v4, shadcn/ui, Drizzle schema for every table in BUILD_PLAN §5, first migration `0000_init`.
- `POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/:id` with Zod validation.
- Home page "queue smoke test": creates a `noop` job and polls every 2s until done.
- `services/analyzer`: uv project, env settings, Postgres queue (`FOR UPDATE SKIP LOCKED`, retry with backoff, permanent errors, stale-lock recovery), worker loop with graceful shutdown, `/healthz` FastAPI app, Dockerfile with ffmpeg.
- `Makefile`: `install`, `dev`, `infra`, `migrate`, `test`, `lint`, `eval`.
- Tests: 4 vitest, 10 pytest (7 against real Postgres, auto-skip if DB is down).
- ✅ Verified in the browser: a dummy job goes queued → running → done in about 2s.

### Next: Phase 1 ✅ (see below)

### Known issues / decisions
- Added a `noop` value to the `job_type` enum (not in BUILD_PLAN) for the Phase 0 smoke test.
- `minio/minio` is no longer on Docker Hub, so we use `quay.io/minio/*`.
- Postgres runs on 5433 because a local Postgres already holds 5432.
- DB integration tests shouldn't run while a worker polls the same DB (they could race for back-dated test jobs).
