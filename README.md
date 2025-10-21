# 42 Intra Login Starter

This repository contains a minimal full-stack setup that lets your users authenticate with their 42 Intra credentials. The frontend is a Next.js App Router project, and the backend is a Python FastAPI service that performs the OAuth2 exchange with the 42 API.

## Structure

- `frontend/` – Next.js 14 with a login dashboard that displays synced 42 data.
- `backend/` – FastAPI application exposing `/auth/login`, `/auth/callback`, `/auth/session`, `/auth/logout`, and `/students/me`.

## Prerequisites

- Node.js 18+ and npm (or pnpm/yarn) for the Next.js app.
- Python 3.11+ for the FastAPI service.
- PostgreSQL 13+ with a database reachable from the backend (`DATABASE_URL`).
- A 42 developer application with a client ID, secret, and redirect URI that matches your backend (`http://localhost:8000/auth/callback` during development).

## Backend setup

1. Copy the example environment file and fill in your credentials:

   ```bash
   cd backend
   cp .env.example .env
   ```

   Update the values:

   - `FORTYTWO_CLIENT_ID` / `FORTYTWO_CLIENT_SECRET`: from the 42 API dashboard.
   - `FORTYTWO_REDIRECT_URI`: must match the redirect configured in 42 (default `http://localhost:8000/auth/callback`).
   - `FRONTEND_APP_URL`: where the Next.js app runs (default `http://localhost:3000`).
   - `SESSION_SECRET_KEY`: long random string used to sign session cookies.
   - `SESSION_COOKIE_SECURE`: set to `true` in production when serving over HTTPS.
   - `DATABASE_URL`: asyncpg connection string, e.g. `postgresql+asyncpg://user:pass@localhost:5432/fortytwo_app`. Make sure this is set before running CLI commands such as `python -m app.manage init-db`.

2. Create a virtual environment and install dependencies:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. Initialise the database schema (creates the `students`, `projects`, and `cursus_enrollments` tables):

   ```bash
   python -m app.manage init-db
   ```

   Repeat with `python -m app.manage drop-db` if you need a clean slate during development.

4. Run the FastAPI server:

   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

The FastAPI service accepts cross-origin requests from the configured frontend origin, issues HTTP-only session cookies, and, after each successful login, synchronises the student profile, cursus enrolments, and project progress into PostgreSQL.

> **Schema updates:** If you pull changes that adjust the table layout (e.g., trimming stored project fields), run `python -m app.manage drop-db` followed by `python -m app.manage init-db` to rebuild the schema.

## Frontend setup

1. Install dependencies:

   ```bash
   cd frontend
   npm install
   ```

2. Start the dev server:

   ```bash
   npm run dev
   ```

3. Navigate to `http://localhost:3000` and click “Continue with 42.” You will be redirected to 42 Intra, and on success the backend sets the session cookie, syncs your data, and redirects back to the dashboard where finished and in-progress projects are listed.

If you need to point the UI at a differently hosted backend, set `NEXT_PUBLIC_AUTH_BASE_URL` in `frontend/.env.local`:

```bash
NEXT_PUBLIC_AUTH_BASE_URL=http://localhost:8000
```

## Database schema

An entity diagram and column reference for `students`, `projects`, and `cursus_enrollments` lives in [`docs/schema.md`](docs/schema.md). Use it as the source of truth when building analytics queries or extending the data model.

## Production notes

- Protect the sync endpoints with rate limiting or background jobs if many students log in concurrently (42’s API enforces rate limits).
- Replace or augment the signed cookie session with a clustered store (Redis/PostgreSQL) if you need refresh-token rotation or manual revocation.
- Serve both services behind HTTPS and configure `SESSION_COOKIE_SECURE=true`.
- Consider adding CSRF protection for the logout endpoint (e.g., double-submit cookie or SameSite=strict) and tightening CORS if the frontend origin changes per environment.
