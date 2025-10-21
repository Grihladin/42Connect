# 42Connect – for 42 students

42Connect merges a polished Next.js dashboard with a FastAPI backend so 42 students can authenticate with their Intra account, sync active & finished projects, and request help from peers who already completed the same work. The project ships with a Docker-based setup (FastAPI, Next.js, PostgreSQL 16) for local development or self-hosted deployments.

## ✨ Highlights

- **Modern dashboard** – Dark, vertically stacked layout with progress tracking, helper availability toggle, and dedicated “Get help” view.
- **FastAPI backend** – Handles the 42 OAuth2 flow, stores synced students/projects in PostgreSQL, and exposes helper matching.
- **Ready to containerize** – Dockerfiles for frontend/backend plus a `docker-compose.yml` that seeds the database and starts all services.
- **Type-safe frontend** – React 18 + Next.js App Router with linting, TypeScript, and custom hooks for session/profile state.

## 📁 Project structure

```
.
├── backend/        # FastAPI application (Python 3.11, asyncpg, SQLAlchemy 2)
├── frontend/       # Next.js 14 App Router UI (React 18)
├── docker-compose.yml
└── docs/           # Additional docs (schema reference, etc.)
```

## 🚀 Quick start (Docker Compose)

1. **Set secrets**
   - Copy `backend/.env` (or create one) and populate:
     - `FORTYTWO_CLIENT_ID`, `FORTYTWO_CLIENT_SECRET`
     - `SESSION_SECRET_KEY`
     - Optional overrides for cookie domain/secure flags

2. **Launch the stack**

   ```bash
   docker compose up --build
   ```

   Services:
   - `db`: PostgreSQL 16 with persistent volume
   - `backend`: FastAPI on <http://localhost:8000>, auto-runs `python -m app.manage init-db`
   - `frontend`: Next.js on <http://localhost:3000>, configured to call the backend

3. **Sign in**
   - Visit <http://localhost:3000>
   - Click **Get help** or the login CTA to authenticate via 42 Intra

> Re-run with `docker compose down` / `up --build` after changes. Logs are viewable via `docker compose logs -f backend` (or `frontend`, `db`).

## 🛠️ Manual setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.manage init-db
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Environment variables (see `backend/.env`):

| Variable | Description |
| --- | --- |
| `FORTYTWO_CLIENT_ID` / `FORTYTWO_CLIENT_SECRET` | OAuth credentials from the 42 developer portal |
| `FORTYTWO_REDIRECT_URI` | Typically `http://localhost:8000/auth/callback` |
| `FRONTEND_APP_URL` | Allowed origin for CORS (default `http://localhost:3000`) |
| `SESSION_SECRET_KEY` | Random string for signing session cookies |
| `DATABASE_URL` | Asyncpg connection string, e.g. `postgresql+asyncpg://app:app@localhost:5432/fortytwo_app` |

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Optionally set `NEXT_PUBLIC_AUTH_BASE_URL` (default `http://localhost:8000`) in `frontend/.env.local`.

## 🧭 Key features

- **Session-aware dashboard** – Welcomes returning students, surfaces project statistics, and exposes helper availability.
- **Helpers directory** – `/helpers` route lists classmates who recently completed matching projects (sorted by completion date).
- **Preference toggles** – Students can opt into helping others via a checkbox that updates backend state.
- **Project normalization** – Keeps CPP modules and other special cases readable by stripping stray percent suffixes while preserving identifiers.

## 🧱 Database schema

SQLAlchemy models live in `backend/app/models.py`, covering:

- `students` – Profile, campus, vibe, helper preference
- `projects` – Current/finished projects with progress, validation status, timestamps
- `cursus_enrollments` – Historical cursus data

Run `python -m app.manage drop-db` followed by `init-db` if migrations are not yet applied after schema changes.

## 🛡️ Production checklist

- Serve behind HTTPS and set `SESSION_COOKIE_SECURE=true`
- Store secrets outside the repo (env vars, secret manager)
- Add alembic/SQL migrations before evolving the schema in production
- Harden containers (non-root user, pinned digests, `npm install sharp` for Next.js image optimization)
- Add monitoring (logs, metrics) and a reverse proxy (nginx/Traefik) for TLS termination

## 🤝 Contributing

1. Fork & clone
2. Create a feature branch
3. Run `npm run lint` (frontend) and `pip install -r requirements.txt && python -m compileall` (backend sanity)
4. Submit a PR describing the change and any DB schema impacts

Issues and feature requests are welcome via GitHub Issues. Let’s make 42Connect the go-to personal project pulse for the 42 community! 💙
