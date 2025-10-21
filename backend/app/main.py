from __future__ import annotations

from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field, model_validator

from .config import Settings, get_settings
from .database import get_session
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
from .sync import sync_student_data
from .models import CursusEnrollment, Project, Student

FINISHED_STATUSES = {"finished", "passed", "validated", "done", "completed"}
IN_PROGRESS_STATUSES = {
  "in_progress",
  "waiting_for_correction",
  "searching_a_group",
  "creating_group",
  "parent",
}

load_dotenv()


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


def _state_cookie_delete_kwargs(settings: Settings) -> dict:
  kwargs: dict = {"path": "/"}
  if settings.session_cookie_domain:
    kwargs["domain"] = settings.session_cookie_domain
  return kwargs


def _cookie_delete_kwargs(settings: Settings) -> dict:
  kwargs: dict = {"path": "/"}
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


async def get_required_session(
  session: Optional[SessionData] = Depends(get_optional_session),
) -> SessionData:
  if not session:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
  return session


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


def student_to_dict(student: Student) -> dict:
  return {
    "id": student.id,
    "fortyTwoId": student.forty_two_id,
    "login": student.login,
    "displayName": student.display_name,
    "email": student.email,
    "imageUrl": student.image_url,
    "campus": student.campus,
    "vibe": student.vibe,
    "readyToHelp": student.ready_to_help,
    "createdAt": student.created_at.isoformat() if student.created_at else None,
    "updatedAt": student.updated_at.isoformat() if student.updated_at else None,
  }


def project_to_dict(project: Project) -> dict:
  return {
    "id": project.id,
    "fortyTwoProjectUserId": project.forty_two_project_user_id,
    "fortyTwoProjectId": project.forty_two_project_id,
    "slug": project.slug,
    "name": project.name,
    "status": project.status,
    "validated": project.validated,
    "finalMark": project.final_mark,
    "progressPercent": project.progress_percent,
    "markedAt": project.marked_at.isoformat() if project.marked_at else None,
    "finishedAt": project.finished_at.isoformat() if project.finished_at else None,
    "syncedAt": project.synced_at.isoformat() if project.synced_at else None,
  }


def cursus_to_dict(cursus: CursusEnrollment) -> dict:
  return {
    "id": cursus.id,
    "fortyTwoCursusId": cursus.forty_two_cursus_id,
    "name": cursus.name,
    "grade": cursus.grade,
    "beganAt": cursus.began_at.isoformat() if cursus.began_at else None,
    "endedAt": cursus.ended_at.isoformat() if cursus.ended_at else None,
    "syncedAt": cursus.synced_at.isoformat() if cursus.synced_at else None,
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
  db: AsyncSession = Depends(get_session),
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

    await sync_student_data(db, client, profile)

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
  response.delete_cookie(settings.oauth_state_cookie_name, **_state_cookie_delete_kwargs(settings))
  return response


@app.post("/auth/logout")
async def logout(
  settings: Settings = Depends(get_settings),
  session: Optional[SessionData] = Depends(get_optional_session),
) -> RedirectResponse:
  if session and session.refresh_token:
    async with build_oauth_client(settings, token={"refresh_token": session.refresh_token}) as client:
      try:
        await client.post(
          "https://api.intra.42.fr/oauth/token",
          data={
            "grant_type": "revoke_token",
            "token": session.refresh_token,
            "client_id": settings.forty_two_client_id,
            "client_secret": settings.forty_two_client_secret,
          },
        )
      except Exception:
        pass

  response = RedirectResponse(settings.frontend_app_url, status_code=status.HTTP_303_SEE_OTHER)
  response.delete_cookie(settings.session_cookie_name, **_cookie_delete_kwargs(settings))
  response.delete_cookie(settings.oauth_state_cookie_name, **_state_cookie_delete_kwargs(settings))
  return response


@app.get("/auth/session")
async def session_endpoint(
  session: Optional[SessionData] = Depends(get_optional_session),
) -> JSONResponse:
  if not session:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
  return JSONResponse(session_to_payload(session))


def is_finished_project(project: Project) -> bool:
  if project.validated:
    return True
  if project.status and project.status.lower() in FINISHED_STATUSES:
    return True
  if project.final_mark is not None and (project.status or "").lower() not in IN_PROGRESS_STATUSES:
    return True
  return False


def is_in_progress_project(project: Project) -> bool:
  status = (project.status or "").lower()
  if status in IN_PROGRESS_STATUSES:
    return True
  if not is_finished_project(project) and project.final_mark is None:
    return True
  return False


class UpdatePreferencesPayload(BaseModel):
  vibe: str | None = Field(default=None, min_length=1, max_length=255)
  readyToHelp: bool | None = None

  @model_validator(mode="after")
  def check_payload(cls, values: "UpdatePreferencesPayload") -> "UpdatePreferencesPayload":
    if values.vibe is None and values.readyToHelp is None:
      raise ValueError("Provide at least one field to update.")
    return values


@app.get("/students/me")
async def current_student(
  session: SessionData = Depends(get_required_session),
  db: AsyncSession = Depends(get_session),
) -> JSONResponse:
  student = await db.scalar(
    select(Student)
    .where(Student.forty_two_id == session.user.id)
    .options(
      selectinload(Student.projects),
      selectinload(Student.cursus_enrollments),
    )
  )

  if not student:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not synced")

  finished_projects = [
    project_to_dict(project)
    for project in student.projects
    if is_finished_project(project)
  ]
  in_progress_projects = [
    project_to_dict(project)
    for project in student.projects
    if is_in_progress_project(project)
  ]

  return JSONResponse(
    {
      "student": student_to_dict(student),
      "projects": {
        "finished": finished_projects,
        "inProgress": in_progress_projects,
        "all": [project_to_dict(project) for project in student.projects],
      },
      "cursus": [cursus_to_dict(cursus) for cursus in student.cursus_enrollments],
    }
  )


@app.post("/students/me/preferences")
async def update_preferences(
  payload: UpdatePreferencesPayload,
  session: SessionData = Depends(get_required_session),
  db: AsyncSession = Depends(get_session),
) -> JSONResponse:
  student = await db.scalar(
    select(Student).where(Student.forty_two_id == session.user.id)
  )
  if not student:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not synced")

  updated = False

  if payload.vibe is not None:
    cleaned_vibe = payload.vibe.strip()
    if not cleaned_vibe:
      raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Vibe cannot be empty")
    student.vibe = cleaned_vibe
    updated = True

  if payload.readyToHelp is not None:
    student.ready_to_help = payload.readyToHelp
    updated = True

  if not updated:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No updates were applied")

  await db.commit()
  await db.refresh(student)

  return JSONResponse({"student": student_to_dict(student)})


@app.get("/healthz")
async def healthz() -> dict:
  return {"status": "ok"}
