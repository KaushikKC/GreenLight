# Progress

## Phase 2: Transcription + LLM checks ✅ (2026-09-22 → 2026-09-23)

### Done
- **Transcription:** faster-whisper (`small`, int8, CPU, word timestamps, VAD filter). Model is downloaded on first use; Docker caches it in the `whisper-cache` volume.
- **LLM providers:** `LLM_PROVIDER=anthropic|gemini` (unset = whichever key exists, Anthropic first). Anthropic uses a strict tool; Gemini (free tier, `gemini-3.5-flash`) uses JSON-schema response mode with `$ref`s inlined. Shared orchestration (validation, one retry, `llm_calls` logging) in `llm/client.py`; per-provider models via `MODEL_VISION` / `GEMINI_MODEL_VISION`.
- **LLM client** (Anthropic provider): one strict tool (`strict: true`, schema generated from Pydantic with unsupported constraints stripped), `tool_choice: auto` + a check that the tool was called (forced tool choice 400s on some models, and models come from env). Pydantic validation; invalid/missing call is fed back and retried once, then `LLMError` → dependent checks show "couldn't check". Refusals aren't retried. Every call is logged to `llm_calls` (tokens incl. cache, USD cost, latency). System prompt is cache-marked.
- **Prompts:** `preflight_v1.md`, then `preflight_v2.md` (current), which separates "do we know what's advertised" from "is it visible" after v1 answered `product_identified=false` despite a brand name. `preflights.prompt_version` is set on every run.
- **Vision call:** all hook frames + up to 8 later frames (each labelled `t=…s`), timestamped transcript, OCR text, brand, brief, caption. Schema = BUILD_PLAN §6.4 + `product_identified`, `on_screen_hook`, `brief_points[].mandatory`.
- **New checks:** `hook.visual_product`, `hook.spoken` (timing + hook strength), `hook.text` (+ reinforcement judgement), `msg.brief_points`, `msg.brief_donts` (caps score), `msg.cta` (phrase match + LLM), `msg.claims`, `comp.disclosure` (caption/OCR/speech tags + LLM; caps score). `read.captions` now uses OCR-vs-transcript word overlap (VAD proxy remains as fallback, labelled estimate).
- **Rules:** hook timing, CTA phrases/window and disclosure tags/phrases live in `platforms.json`.
- **Report:** transcript segments; `meta.prompt_version`, `meta.llm_cost_usd`, `meta.llm_calls`, `meta.ai_review_error`.
- **Tests:** 164 pytest (fake Anthropic client for the wrapper and call builder, every new check, llm_calls DB logging, real whisper on a `say` clip) + 15 vitest.
- ✅ Verified end-to-end without an API key: transcript + deterministic halves run, LLM checks show "couldn't check", disclosure hard cap → 49 "Not ready".

- ✅ **Live run (Gemini 3.5 Flash, free tier):** one call, ~12.3k input / ~2k output tokens, 11–18s, $0 logged to `llm_calls`; whole job ~20s. Covered brief points returned with timestamps + quotes (3.0s "Here is how I use it every morning.", 5.8s "Tap the link to try it."); missing points, product-not-shown, CTA, risky claim and missing disclosure all judged correctly.

### Next: Phase 3 (Preflight UI)
Progress screen, score dial, video player with timeline markers, safe-zone overlay, grouped checklist, fix list, share link, re-check diff. Mobile-first, distinctive look.

### Known issues / decisions
- `comp.disclosure` with **no caption** provided and nothing on screen/spoken is a *warn*, not a fail (we can't see where #ad usually lives). With a caption and no disclosure anywhere it fails and caps the score.
- Brief checks are `na` without a brief, `error` if a brief was given but the AI step failed.
- Pricing table in `llm/pricing.py` is hand-maintained; unknown models log `cost_usd = NULL`. Gemini logs $0 while `GEMINI_FREE_TIER=true`.
- Gemini 2.5 models return 404 "no longer available to new users"; defaults are `gemini-3.5-flash` / `gemini-3.5-flash-lite`. `gemini-flash-latest` was returning 503 (high demand).
- Gemini free-tier data may be used by Google: test videos only. Anthropic remains the default when `ANTHROPIC_API_KEY` is set.
- `hook.spoken` strength is subjective: Gemini rated "Stop scrolling." 1–2/5. Revisit with the Phase 6 golden set.
- After whisper has loaded, the Python process can print `libc++abi … recursive_mutex lock failed` at interpreter exit (native teardown). Tests still exit 0; harmless for the long-running worker.


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
