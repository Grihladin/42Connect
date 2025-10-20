from __future__ import annotations

from typing import Optional

from authlib.integrations.httpx_client import AsyncOAuth2Client

from .config import Settings

FORTY_TWO_AUTHORIZATION_URL = "https://api.intra.42.fr/oauth/authorize"
FORTY_TWO_TOKEN_URL = "https://api.intra.42.fr/oauth/token"
FORTY_TWO_USERINFO_URL = "https://api.intra.42.fr/v2/me"
FORTY_TWO_SCOPE = "public"


def build_oauth_client(settings: Settings, token: Optional[dict] = None) -> AsyncOAuth2Client:
  return AsyncOAuth2Client(
    client_id=settings.forty_two_client_id,
    client_secret=settings.forty_two_client_secret,
    token_endpoint=FORTY_TWO_TOKEN_URL,
    token=token,
    scope=FORTY_TWO_SCOPE,
    redirect_uri=settings.forty_two_redirect_uri,
  )
