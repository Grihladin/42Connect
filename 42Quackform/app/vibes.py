from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from .db import get_connection
from .embeddings import embed_text
from .errors import DatabaseError, EmbeddingError, NormalizationError
from .settings import get_settings
from .text_normalization import normalize_text


@dataclass
class Vibe:
    uid: str
    original_vibe: str
    processed_vibe: str
    embedding_model: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class SearchResult:
    uid: str
    original_vibe: str
    processed_vibe: str
    embedding_model: str
    distance: float

    @property
    def similarity(self) -> float:
        return max(0.0, 1.0 - self.distance)


def upsert_vibe(uid: str, vibe: str) -> None:
    settings = get_settings()

    try:
        processed_vibe = normalize_text(vibe)
    except NormalizationError as exc:
        raise EmbeddingError(str(exc)) from exc

    embedding = embed_text(processed_vibe, already_normalized=True)
    original_vibe = vibe.strip()

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO vibes (uid, original_vibe, vibe, embedding, embedding_model)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (uid) DO UPDATE
                SET original_vibe = EXCLUDED.original_vibe,
                    vibe = EXCLUDED.vibe,
                embedding = EXCLUDED.embedding,
                    embedding_model = EXCLUDED.embedding_model,
                    updated_at = NOW();
                """,
                (
                    uid,
                    original_vibe,
                    processed_vibe,
                    embedding,
                    settings.embedding_model,
                ),
            )
    except EmbeddingError:
        raise
    except Exception as exc:  # pragma: no cover - DB errors
        raise DatabaseError(f"Failed to upsert vibe: {exc}") from exc


def fetch_vibe(uid: str) -> Optional[Vibe]:
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT uid, original_vibe, vibe, embedding_model, created_at, updated_at
                FROM vibes
                WHERE uid = %s;
                """,
                (uid,),
            )
            row = cur.fetchone()
    except Exception as exc:  # pragma: no cover
        raise DatabaseError(f"Failed to fetch vibe: {exc}") from exc

    if not row:
        return None

    return Vibe(
        uid=row[0],
        original_vibe=row[1],
        processed_vibe=row[2],
        embedding_model=row[3],
        created_at=row[4].isoformat() if row[4] else None,
        updated_at=row[5].isoformat() if row[5] else None,
    )


def list_vibes(limit: int = 20) -> List[Vibe]:
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT uid, original_vibe, vibe, embedding_model, created_at, updated_at
                FROM vibes
                ORDER BY updated_at DESC
                LIMIT %s;
                """,
                (limit,),
            )
            rows = cur.fetchall()
    except Exception as exc:  # pragma: no cover
        raise DatabaseError(f"Failed to list vibes: {exc}") from exc

    return [
        Vibe(
            uid=row[0],
            original_vibe=row[1],
            processed_vibe=row[2],
            embedding_model=row[3],
            created_at=row[4].isoformat() if row[4] else None,
            updated_at=row[5].isoformat() if row[5] else None,
        )
        for row in rows
    ]


def search_vibes(query: str, top_k: int = 5) -> List[SearchResult]:
    embedding = embed_text(query)

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT uid,
                       original_vibe,
                       vibe,
                       embedding_model,
                       embedding <=> %s::vector AS distance
                FROM vibes
                ORDER BY embedding <=> %s::vector
                LIMIT %s;
                """,
                (embedding, embedding, top_k),
            )
            rows = cur.fetchall()
    except EmbeddingError:
        raise
    except Exception as exc:  # pragma: no cover
        raise DatabaseError(f"Failed to search vibes: {exc}") from exc

    return [
        SearchResult(
            uid=row[0],
            original_vibe=row[1],
            processed_vibe=row[2],
            embedding_model=row[3],
            distance=float(row[4]),
        )
        for row in rows
    ]


def wipe_vibes() -> None:
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM vibes;")
    except Exception as exc:  # pragma: no cover
        raise DatabaseError(f"Failed to wipe vibes table: {exc}") from exc
