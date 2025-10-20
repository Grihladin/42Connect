from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class Settings:
  forty_two_client_id: str
  forty_two_client_secret: str
  forty_two_redirect_uri: str
  frontend_app_url: str
  session_secret: str
  session_cookie_name: str = "ft_session"
  oauth_state_cookie_name: str = "ft_oauth_state"
  session_max_age: int = 7 * 24 * 60 * 60  # 7 days
  session_cookie_secure: bool = False
  session_cookie_domain: Optional[str] = None

  @classmethod
  def from_env(cls) -> "Settings":
    client_id = os.getenv("FORTYTWO_CLIENT_ID")
    client_secret = os.getenv("FORTYTWO_CLIENT_SECRET")
    redirect_uri = os.getenv("FORTYTWO_REDIRECT_URI", "http://localhost:8000/auth/callback")
    frontend = os.getenv("FRONTEND_APP_URL", "http://localhost:3000")
    session_secret = os.getenv("SESSION_SECRET_KEY")
    cookie_secure = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
    cookie_domain = os.getenv("SESSION_COOKIE_DOMAIN")

    missing = [name for name, value in [
      ("FORTYTWO_CLIENT_ID", client_id),
      ("FORTYTWO_CLIENT_SECRET", client_secret),
      ("SESSION_SECRET_KEY", session_secret),
    ] if not value]

    if missing:
      raise RuntimeError(
        f"Missing required environment variables: {', '.join(missing)}"
      )

    return cls(
      forty_two_client_id=client_id or "",
      forty_two_client_secret=client_secret or "",
      forty_two_redirect_uri=redirect_uri,
      frontend_app_url=frontend,
      session_secret=session_secret or "",
      session_cookie_secure=cookie_secure,
      session_cookie_domain=cookie_domain or None,
    )
