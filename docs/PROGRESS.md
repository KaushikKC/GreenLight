# Progress

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

### Next: Phase 1 (Upload + deterministic Preflight)
Presigned upload, video row, probe, frames, loudness, OCR, blur/brightness, scene cuts, `rules/platforms.json`, format/readability/audio/technical checks, scoring, raw JSON report page.

### Known issues / decisions
- Added a `noop` value to the `job_type` enum (not in BUILD_PLAN) for the Phase 0 smoke test.
- Auth.js + guest mode not wired yet. Jobs aren't user-scoped. Planned before `/preflight` pages ship.
- `minio/minio` is no longer on Docker Hub, so we use `quay.io/minio/*`.
- Postgres runs on 5433 because a local Postgres already holds 5432.
- DB integration tests shouldn't run while a worker polls the same DB (they could race for back-dated test jobs).
- ffmpeg isn't installed on the host (`brew install ffmpeg` needed for Phase 1 local runs); the Docker image has it.
