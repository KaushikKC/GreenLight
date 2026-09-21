# CLAUDE.md — Greenlight

## What we're building
Greenlight is a creator-side tool with three features:
1. **Preflight** (core): analyses a draft video and reports whether it's ready to run as a paid creator ad.
2. **Rights Wallet**: organises the usage, whitelisting and exclusivity terms in a creator's contracts.
3. **Brands You Already Love**: finds brands a creator already mentions organically and drafts warm pitches.

The full spec is in `docs/BUILD_PLAN.md`. Read it before any task. Work **one phase at a time** (Section 10) and don't start the next phase unless asked.

## Stack
- `apps/web`: Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui, Drizzle + Postgres, Zod, Auth.js
- `services/analyzer`: Python 3.11+, uv, ffmpeg, OpenCV, PySceneDetect, faster-whisper, RapidOCR, Anthropic SDK, Pydantic
- Queue = Postgres `jobs` table (`FOR UPDATE SKIP LOCKED`). No Redis.
- Storage = S3-compatible (MinIO locally).

## Commands
- `make dev`: docker compose up + web dev server + worker
- `make test`: vitest + pytest
- `make eval`: run eval suites
- `pnpm --filter web db:generate && pnpm --filter web db:migrate`: after any schema change

## Rules
- **Plan first.** For each phase, write a short plan in chat, then implement. Keep diffs focused.
- **Evidence or it didn't happen.** Every check result must include a timestamp, frame, quote or clause, plus a concrete fix.
- **LLM output = tool use + JSON schema**, validated with Pydantic. Retry once, then mark the check `error`. Log every call to `llm_calls` (tokens, cost, latency).
- **Model names come from env** (`MODEL_VISION`, `MODEL_FAST`). Never hard-code them.
- **Prompts live in `services/analyzer/analyzer/llm/prompts/*.md`**, versioned (`_v1`, `_v2`). Store `prompt_version` on results.
- **Platform rules live in `rules/platforms.json`.** Never hard-code thresholds or safe zones. Values marked `TODO_VERIFY` stay as they are until a human confirms them.
- **No scraping** of TikTok or Instagram. Use only user-provided data.
- **Never send anything on the user's behalf.** Pitches are drafts only.
- Rights Wallet pages show: "Greenlight organises your contracts; it isn't legal advice."
- Heuristic checks are labelled "estimate" in the UI.
- Mobile-first UI. Test at a 390px width.
- Write tests alongside code: unit tests for every check and every `rights.ts` function.
- After each phase: run tests, commit with a clear message, and update `docs/PROGRESS.md` (done / next / known issues).
- Ask before adding a new external service or paid API.
