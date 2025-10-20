from __future__ import annotations

from functools import lru_cache
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from .config import Settings
from .oauth import (
  FORTY_TWO_AUTHORIZATION_URL,
  FORTY_TWO_USERINFO_URL,
  build_oauth_client,
)
from .session import (
  SessionData,
  UserProfile,
  decode_session,
  decode_state,
  encode_session,
  encode_state,
)

load_dotenv()


@lru_cache
def get_settings() -> Settings:
  return Settings.from_env()


def _cookie_kwargs(settings: Settings) -> dict:
  kwargs: dict = {
    "secure": settings.session_cookie_secure,
    "httponly": True,
    "samesite": "lax",
    "path": "/",
    "max_age": settings.session_max_age,
  }
  if settings.session_cookie_domain:
    kwargs["domain"] = settings.session_cookie_domain
  return kwargs


def _state_cookie_kwargs(settings: Settings) -> dict:
  kwargs: dict = {
    "secure": settings.session_cookie_secure,
    "httponly": True,
    "samesite": "lax",
    "path": "/",
  }
  if settings.session_cookie_domain:
    kwargs["domain"] = settings.session_cookie_domain
  return kwargs


app = FastAPI(title="42 OAuth Bridge", version="0.1.0")

_startup_settings = get_settings()
app.add_middleware(
  CORSMiddleware,
  allow_origins=[_startup_settings.frontend_app_url],
  allow_credentials=True,
  allow_methods=["GET", "POST", "OPTIONS"],
  allow_headers=["*"],
)


async def get_optional_session(
  request: Request,
  settings: Settings = Depends(get_settings),
) -> Optional[SessionData]:
  raw = request.cookies.get(settings.session_cookie_name)
  if not raw:
    return None
  return decode_session(raw, settings)


def session_to_payload(session: SessionData) -> dict:
  return {
    "user": {
      "id": session.user.id,
      "login": session.user.login,
      "displayName": session.user.display_name,
      "imageUrl": session.user.image_url,
    },
    "expiresAt": session.expires_at,
  }


@app.get("/auth/login")
async def login(settings: Settings = Depends(get_settings)) -> RedirectResponse:
  client = build_oauth_client(settings)
  authorization_url, state = client.create_authorization_url(FORTY_TWO_AUTHORIZATION_URL)
  response = RedirectResponse(authorization_url, status_code=status.HTTP_302_FOUND)
  response.set_cookie(
    settings.oauth_state_cookie_name,
    encode_state(state, settings),
    **_state_cookie_kwargs(settings),
  )
  return response


@app.get("/auth/callback")
async def callback(
  request: Request,
  code: Optional[str] = None,
  state: Optional[str] = None,
  settings: Settings = Depends(get_settings),
) -> RedirectResponse:
  if not code or not state:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing OAuth parameters")

  state_cookie = request.cookies.get(settings.oauth_state_cookie_name)
  if not state_cookie:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state cookie missing")

  original_state = decode_state(state_cookie, settings)
  if original_state != state:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state mismatch")

  async with build_oauth_client(settings) as client:
    try:
      token = await client.fetch_token(code=code)
    except Exception as exc:  # noqa: BLE001
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to fetch tokens") from exc

    user_response = await client.get(FORTY_TWO_USERINFO_URL)
    if user_response.status_code != status.HTTP_200_OK:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to fetch user profile")

    profile = user_response.json()

  session = SessionData(
    user=UserProfile(
      id=profile.get("id"),
      login=profile.get("login", ""),
      display_name=profile.get("displayname") or profile.get("usual_full_name") or profile.get("login", ""),
      image_url=(profile.get("image") or {}).get("link"),
    ),
    access_token=token.get("access_token"),
    refresh_token=token.get("refresh_token"),
    expires_at=token.get("expires_at"),
  )

  response = RedirectResponse(settings.frontend_app_url, status_code=status.HTTP_302_FOUND)
  response.set_cookie(
    settings.session_cookie_name,
    encode_session(session, settings),
    **_cookie_kwargs(settings),
  )
  response.delete_cookie(settings.oauth_state_cookie_name, **_state_cookie_kwargs(settings))
  return response


@app.post("/auth/logout")
async def logout(settings: Settings = Depends(get_settings)) -> RedirectResponse:
  response = RedirectResponse(settings.frontend_app_url, status_code=status.HTTP_303_SEE_OTHER)
  response.delete_cookie(settings.session_cookie_name, **_cookie_kwargs(settings))
  return response


@app.get("/auth/session")
async def session_endpoint(
  session: Optional[SessionData] = Depends(get_optional_session),
) -> JSONResponse:
  if not session:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
  return JSONResponse(session_to_payload(session))


@app.get("/healthz")
async def healthz() -> dict:
  return {"status": "ok"}
