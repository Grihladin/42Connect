class EmbeddingError(Exception):
    """Raised when generating embeddings fails or produces invalid data."""


class DatabaseError(Exception):
    """Raised when a database interaction fails."""


class NormalizationError(Exception):
    """Raised when text normalization produces unusable content."""
