from __future__ import annotations

import math
from functools import lru_cache

import httpx
from openai import OpenAI
from pgvector.psycopg import to_db

from .errors import EmbeddingError, NormalizationError
from .settings import get_settings
from .text_normalization import normalize_text


@lru_cache(maxsize=1)
def _get_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise EmbeddingError(
            "OPENAI_API_KEY environment variable is required to create embeddings."
        )

    client_kwargs = {
        "api_key": settings.openai_api_key,
        "http_client": httpx.Client(trust_env=False),
    }

    if settings.openai_base_url:
        client_kwargs["base_url"] = settings.openai_base_url

    return OpenAI(**client_kwargs)


def embed_text(text: str, *, already_normalized: bool = False) -> list[float]:
    try:
        normalized = text if already_normalized else normalize_text(text)
    except NormalizationError as exc:
        raise EmbeddingError(str(exc)) from exc

    settings = get_settings()
    client = _get_client()

    try:
        response = client.embeddings.create(model=settings.embedding_model, input=normalized)
    except Exception as exc:  # pragma: no cover - API errors
        raise EmbeddingError(f"Failed to create embedding via OpenAI: {exc}") from exc

    if not response.data:
        raise EmbeddingError("OpenAI returned no embedding data.")

    embedding = response.data[0].embedding
    if len(embedding) != settings.embedding_dimension:
        raise EmbeddingError(
            f"Embedding dimension mismatch: expected {settings.embedding_dimension}, "
            f"received {len(embedding)}."
        )

    norm = math.sqrt(sum(component * component for component in embedding))
    if norm == 0:
        raise EmbeddingError("Embedding norm evaluated to zero; cannot normalize.")

    normalized = [component / norm for component in embedding]
    return to_db(normalized, settings.embedding_dimension)
