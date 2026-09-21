"""Internal HTTP surface (health only for now).

Run with `uv run uvicorn analyzer.api:app --port 8000`.
"""

import psycopg
from fastapi import FastAPI, Response

from analyzer.db import connect

app = FastAPI(title="Greenlight analyzer", docs_url=None, redoc_url=None)


@app.get("/healthz")
def healthz(response: Response) -> dict[str, str]:
    try:
        with connect() as conn:
            conn.execute("SELECT 1")
    except psycopg.OperationalError:
        response.status_code = 503
        return {"status": "degraded", "db": "down"}
    return {"status": "ok", "db": "up"}
