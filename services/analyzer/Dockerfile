FROM python:3.12-slim

# ffmpeg is needed from Phase 1 (probe, frames, loudness).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY analyzer ./analyzer
RUN uv sync --frozen --no-dev

CMD ["uv", "run", "--no-sync", "python", "-m", "analyzer.worker"]
