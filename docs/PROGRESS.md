# Progress

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
