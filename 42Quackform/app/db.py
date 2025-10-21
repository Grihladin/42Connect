from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg import sql
from pgvector.psycopg import register_vector

from .errors import DatabaseError
from .settings import get_settings

_SCHEMA_PATCHED = False


def _ensure_vibes_schema(conn: psycopg.Connection) -> None:
    global _SCHEMA_PATCHED
    if _SCHEMA_PATCHED:
        return

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'vibes';
                """
            )
            columns = {row[0] for row in cur.fetchall()}

            if "original_vibe" not in columns:
                cur.execute("ALTER TABLE vibes ADD COLUMN original_vibe TEXT;")
                cur.execute("UPDATE vibes SET original_vibe = vibe;")
                cur.execute(
                    "ALTER TABLE vibes ALTER COLUMN original_vibe SET NOT NULL;"
                )
    except Exception as exc:
        raise DatabaseError(f"Failed to ensure vibes schema: {exc}") from exc

    _SCHEMA_PATCHED = True


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    settings = get_settings()
    try:
        conn = psycopg.connect(settings.database_url, autocommit=True)
        register_vector(conn)
        _ensure_vibes_schema(conn)
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("SET ivfflat.probes = {}").format(
                    sql.Literal(settings.ivfflat_probes)
                )
            )
    except Exception as exc:  # pragma: no cover - connection errors bubble up
        raise DatabaseError(f"Failed to connect to database: {exc}") from exc

    try:
        yield conn
    finally:
        conn.close()
