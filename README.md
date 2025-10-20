# 42 Intra Login Starter

This repository contains a minimal full-stack setup that lets your users authenticate with their 42 Intra credentials. The frontend is a Next.js App Router project, and the backend is a Python FastAPI service that performs the OAuth2 exchange with the 42 API.

## Structure

- `frontend/` – Next.js 14 with a single login page that talks to the backend via fetch.
- `backend/` – FastAPI application exposing `/auth/login`, `/auth/callback`, `/auth/session`, and `/auth/logout`.

## Prerequisites

- Node.js 18+ and npm (or pnpm/yarn) for the Next.js app.
- Python 3.11+ for the FastAPI service.
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

2. Install dependencies and run the server:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

The FastAPI service accepts cross-origin requests from the configured frontend origin and issues HTTP-only cookies that store the signed session payload.

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

3. Navigate to `http://localhost:3000` and click “Continue with 42.” You will be redirected to 42 Intra, and on success the backend sets the session cookie before redirecting you back to the Next.js page.

If you need to point the UI at a differently hosted backend, set `NEXT_PUBLIC_AUTH_BASE_URL` in `frontend/.env.local`:

```bash
NEXT_PUBLIC_AUTH_BASE_URL=http://localhost:8000
```

## Production notes

- Replace the cookie-based session with a persistent store (database or Redis) if you need to handle refresh tokens securely or revoke sessions.
- Serve both services behind HTTPS and configure `SESSION_COOKIE_SECURE=true`.
- Consider adding CSRF protection for the logout endpoint (e.g., double-submit cookie or SameSite=strict) and tightening CORS if the frontend origin changes per environment.
