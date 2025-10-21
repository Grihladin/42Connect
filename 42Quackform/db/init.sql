CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vibes (
    uid TEXT PRIMARY KEY,
    original_vibe TEXT NOT NULL,
    vibe TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vibes_embedding_idx
    ON vibes USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vibes_set_updated_at ON vibes;

CREATE TRIGGER vibes_set_updated_at
BEFORE UPDATE ON vibes
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();
