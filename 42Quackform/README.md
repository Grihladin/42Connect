## 42Quackform Data Layer

This repository currently provisions PostgreSQL (with pgvector) plus a small Python CLI for managing "vibes" embeddings using OpenAI's `text-embedding-3-small` model.

### Prerequisites
- Docker & Docker Compose
- Python 3.11+
- OpenAI API key with access to embeddings

### Configuration
Create a `.env` file (or export variables in your shell) with the following values:

```
OPENAI_API_KEY=sk-...
# Optional overrides:
# OPENAI_BASE_URL=https://api.openai.com/v1
# EMBEDDING_MODEL=text-embedding-3-small
# EMBEDDING_DIMENSION=1536
# DATABASE_URL=postgresql://quack:quack@localhost:5433/vibes
# IVFFLAT_PROBES=100
```

> The default settings expect the local database started via Docker Compose on port `5433`.

The application automatically loads variables from `.env` using `python-dotenv`, so keeping the file in the project root is enough for both the CLI and web server.

`IVFFLAT_PROBES` tunes how many inverted lists pgvector scans when searching; higher values improve recall (use the default `100` for small datasets, dial it back later if queries get slow).

### Getting Started

1. **Start PostgreSQL**
   ```bash
   docker compose up -d db
   ```

2. **Install Python dependencies**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Manage vibes from the terminal**
   ```bash
   # Store or update a vibe
   python scripts/manage_vibes.py upsert alice "Loves rubber duck debugging"

   # Fetch an existing vibe
   python scripts/manage_vibes.py fetch alice

   # Search for similar vibes
   python scripts/manage_vibes.py search "rubber ducks"

   # List all uids
   python scripts/manage_vibes.py list-uids
   ```

Each command will request embeddings from OpenAI, normalize the vectors, and store/query them using pgvector's cosine distance.

### Web Interface

Launch a minimal FastAPI web app with live forms for adding and searching vibes:

```bash
uvicorn app.main:app --reload
```

Then open http://127.0.0.1:8000/ in your browser. The interface shows a create/update form, recent vibes, and a semantic search block that calls the same OpenAI-powered pipeline under the hood.
