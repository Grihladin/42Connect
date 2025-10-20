from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

from itsdangerous import BadSignature, BadTimeSignature, URLSafeTimedSerializer

from .config import Settings


@dataclass
class UserProfile:
  id: int
  login: str
  display_name: str
  image_url: Optional[str]


@dataclass
class SessionData:
  user: UserProfile
  access_token: Optional[str]
  refresh_token: Optional[str]
  expires_at: Optional[int]


SESSION_SALT = "ft-session"
STATE_SALT = "ft-state"
STATE_TTL_SECONDS = 600


def _session_serializer(settings: Settings) -> URLSafeTimedSerializer:
  return URLSafeTimedSerializer(secret_key=settings.session_secret, salt=SESSION_SALT)


def _state_serializer(settings: Settings) -> URLSafeTimedSerializer:
  return URLSafeTimedSerializer(secret_key=settings.session_secret, salt=STATE_SALT)


def encode_session(data: SessionData, settings: Settings) -> str:
  payload: Dict[str, Any] = {
    "user": {
      "id": data.user.id,
      "login": data.user.login,
      "display_name": data.user.display_name,
      "image_url": data.user.image_url,
    },
    "access_token": data.access_token,
    "refresh_token": data.refresh_token,
    "expires_at": data.expires_at,
    "issued_at": int(time.time()),
  }
  return _session_serializer(settings).dumps(payload)


def decode_session(raw: str, settings: Settings) -> Optional[SessionData]:
  serializer = _session_serializer(settings)
  try:
    payload = serializer.loads(raw, max_age=settings.session_max_age)
  except (BadSignature, BadTimeSignature):
    return None

  user_payload = payload.get("user") or {}
  try:
    user = UserProfile(
      id=int(user_payload["id"]),
      login=str(user_payload["login"]),
      display_name=str(user_payload.get("display_name") or ""),
      image_url=user_payload.get("image_url"),
    )
  except (KeyError, TypeError, ValueError):
    return None

  return SessionData(
    user=user,
    access_token=payload.get("access_token"),
    refresh_token=payload.get("refresh_token"),
    expires_at=payload.get("expires_at"),
  )


def encode_state(state: str, settings: Settings) -> str:
  return _state_serializer(settings).dumps({"state": state})


def decode_state(raw: str, settings: Settings) -> Optional[str]:
  serializer = _state_serializer(settings)
  try:
    payload = serializer.loads(raw, max_age=STATE_TTL_SECONDS)
  except (BadSignature, BadTimeSignature):
    return None
  state = payload.get("state")
  return str(state) if isinstance(state, str) else None
