# Greenlight dev commands. Requires: Docker, Node 24 (see .nvmrc), pnpm via corepack, uv.

ANALYZER := services/analyzer
SUITE ?= preflight

.PHONY: dev infra infra-down migrate web worker test test-web test-analyzer e2e eval install lint

install:
	pnpm install
	cd $(ANALYZER) && uv sync

## Start postgres + minio, apply migrations, then run web and worker together.
dev: infra migrate
	@trap 'kill 0' INT TERM EXIT; \
	  $(MAKE) --no-print-directory worker & \
	  $(MAKE) --no-print-directory web & \
	  wait

infra:
	docker compose up -d --wait postgres minio
	docker compose up minio-init

infra-down:
	docker compose down

migrate:
	pnpm --filter web db:migrate

web:
	pnpm --filter web dev

worker:
	cd $(ANALYZER) && uv run python -m analyzer.worker

test: test-web test-analyzer

test-web:
	pnpm --filter web test

test-analyzer:
	cd $(ANALYZER) && uv run pytest -q

## Playwright happy path (needs `make infra migrate`; builds the app, starts its own worker).
e2e:
	pnpm --filter web test:e2e

lint:
	pnpm --filter web lint
	pnpm --filter web typecheck
	cd $(ANALYZER) && uv run ruff check .

## Eval suites. Default is the free preflight suite; SUITE=contracts|brands|all use the LLM.
eval:
	@if [ -f $(ANALYZER)/evals/run.py ]; then \
	  cd $(ANALYZER) && uv run python -m evals.run --suite $(SUITE); \
	else \
	  echo "No eval suites yet (Phase 6)."; \
	fi
