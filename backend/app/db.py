"""Connection pool and request-scoped connection dependency."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import settings

# Opened lazily so importing the app (in tests, or during a build) does not
# require a reachable database.
pool = ConnectionPool(
    conninfo=settings.database_url,
    min_size=settings.pool_min,
    max_size=settings.pool_max,
    kwargs={"row_factory": dict_row},
    open=False,
)


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    with pool.connection() as conn:
        yield conn


def get_conn() -> Iterator[psycopg.Connection]:
    """FastAPI dependency. One connection per request, returned to the pool after."""
    with pool.connection() as conn:
        yield conn


def healthcheck() -> bool:
    try:
        with pool.connection(timeout=2) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False
