"""Settings loaded from env (shared root .env in dev)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV, extra="ignore")

    database_url: str = "postgres://greenlight:greenlight@localhost:5433/greenlight"

    worker_poll_interval_s: float = 1.5
    worker_max_attempts: int = 3
    # A running job whose lock is older than this is assumed dead and re-queued.
    worker_stale_lock_s: int = 600

    # Model names always come from env; never hard-code them.
    anthropic_api_key: str | None = None
    model_vision: str | None = None
    model_fast: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
