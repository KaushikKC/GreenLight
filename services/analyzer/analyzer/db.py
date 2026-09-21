"""Postgres connection helpers."""

import psycopg
from psycopg.rows import dict_row

from analyzer.config import get_settings


def connect(url: str | None = None) -> psycopg.Connection:
    return psycopg.connect(url or get_settings().database_url, row_factory=dict_row)
