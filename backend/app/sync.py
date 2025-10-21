from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Set
from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import CursusEnrollment, Project, Student

FORTY_TWO_PROJECTS_USERS_URL = "https://api.intra.42.fr/v2/projects_users"
FORTY_TWO_CURSUS_USERS_URL = "https://api.intra.42.fr/v2/cursus_users"
PISCINE_KEYWORD = "piscine"


def utcnow() -> datetime:
  return datetime.now(timezone.utc)


def parse_datetime(value: Any) -> Optional[datetime]:
  if value is None:
    return None
  if isinstance(value, datetime):
    return value
  if isinstance(value, str):
    normalised = value.replace("Z", "+00:00")
    try:
      return datetime.fromisoformat(normalised)
    except ValueError:
      return None
  return None


async def _fetch_all(client: AsyncOAuth2Client, url: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
  page = 1
  aggregated: List[Dict[str, Any]] = []

  while True:
    page_params = {**params, "page[size]": 100, "page[number]": page}
    response = await client.get(url, params=page_params)
    if response.status_code != status.HTTP_200_OK:
      raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Failed to fetch data from 42 API: {url}",
      )
    batch = response.json()
    if not batch:
      break
    aggregated.extend(batch)
    if len(batch) < 100:
      break
    page += 1

  return aggregated


def _extract_campus(profile: Dict[str, Any]) -> Optional[str]:
  campuses = profile.get("campus")
  if isinstance(campuses, list) and campuses:
    primary = campuses[0]
    name = primary.get("name")
    if isinstance(name, str):
      return name
  return None


async def _upsert_student(session: AsyncSession, profile: Dict[str, Any]) -> Student:
  forty_two_id = profile.get("id")
  if forty_two_id is None:
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Profile missing id")

  stmt = select(Student).where(Student.forty_two_id == forty_two_id)
  student = await session.scalar(stmt)

  login = profile.get("login") or ""
  display_name = profile.get("displayname") or profile.get("usual_full_name") or login

  if student is None:
    student = Student(
      forty_two_id=forty_two_id,
      login=login,
      display_name=display_name,
      email=profile.get("email"),
      image_url=(profile.get("image") or {}).get("link"),
      campus=_extract_campus(profile),
    )
    session.add(student)
    await session.flush()
  else:
    student.login = login
    student.display_name = display_name
    student.email = profile.get("email")
    student.image_url = (profile.get("image") or {}).get("link")
    student.campus = _extract_campus(profile)

  return student


def _project_payload_to_kwargs(
  data: Dict[str, Any],
  student_id: int,
) -> Dict[str, Any]:
  project = data.get("project") or {}
  project_user_id = data.get("id")
  project_id = project.get("id")
  raw_name = project.get("name")
  parsed = _parse_progress_percent(raw_name)
  return {
    "student_id": student_id,
    "forty_two_project_user_id": int(project_user_id) if project_user_id is not None else None,
    "forty_two_project_id": int(project_id) if project_id is not None else None,
    "slug": project.get("slug"),
    "name": parsed.cleaned_name if parsed else raw_name,
    "progress_percent": parsed.percent if parsed else None,
    "status": data.get("status"),
    "validated": data.get("validated?"),
    "final_mark": data.get("final_mark"),
    "marked_at": parse_datetime(data.get("marked_at")),
    "synced_at": utcnow(),
  }


def _cursus_payload_to_kwargs(
  data: Dict[str, Any],
  student_id: int,
) -> Dict[str, Any]:
  cursus = data.get("cursus") or {}
  cursus_id = cursus.get("id") or data.get("cursus_id")
  return {
    "student_id": student_id,
    "forty_two_cursus_id": int(cursus_id) if cursus_id is not None else None,
    "name": cursus.get("name"),
    "grade": data.get("grade"),
    "began_at": parse_datetime(data.get("begin_at")),
    "ended_at": parse_datetime(data.get("end_at")),
    "synced_at": utcnow(),
  }


async def _sync_projects(session: AsyncSession, student: Student, payloads: Iterable[Dict[str, Any]]) -> None:
  existing_projects = await session.execute(
    select(Project).where(Project.student_id == student.id)
  )
  project_map = {proj.forty_two_project_user_id: proj for proj in existing_projects.scalars()}

  seen_ids: Set[int] = set()

  for item in payloads:
    if not _should_store_project(item):
      continue
    project_user_id_raw = item.get("id")
    project_user_id = int(project_user_id_raw) if project_user_id_raw is not None else None
    if project_user_id is None:
      continue
    seen_ids.add(project_user_id)
    project = project_map.get(project_user_id)
    kwargs = _project_payload_to_kwargs(item, student.id)
    if project is None:
      project = Project(**kwargs)
      session.add(project)
    else:
      for key, value in kwargs.items():
        setattr(project, key, value)

  to_delete = set(project_map.keys()) - seen_ids
  if to_delete:
    await session.execute(
      delete(Project).where(
        Project.student_id == student.id,
        Project.forty_two_project_user_id.in_(tuple(to_delete)),
      )
    )


async def _sync_cursus(session: AsyncSession, student: Student, payloads: Iterable[Dict[str, Any]]) -> None:
  existing = await session.execute(
    select(CursusEnrollment).where(CursusEnrollment.student_id == student.id)
  )
  cursus_map = {c.forty_two_cursus_id: c for c in existing.scalars() if c.forty_two_cursus_id is not None}
  seen_ids: Set[int] = set()

  for item in payloads:
    cursus_id_raw = item.get("cursus_id") or (item.get("cursus") or {}).get("id")
    cursus_id = int(cursus_id_raw) if cursus_id_raw is not None else None
    if cursus_id is None:
      continue
    seen_ids.add(cursus_id)
    enrollment = cursus_map.get(cursus_id)
    kwargs = _cursus_payload_to_kwargs(item, student.id)
    if enrollment is None:
      enrollment = CursusEnrollment(**kwargs)
      session.add(enrollment)
    else:
      for key, value in kwargs.items():
        setattr(enrollment, key, value)

  to_delete = set(cursus_map.keys()) - seen_ids
  if to_delete:
    await session.execute(
      delete(CursusEnrollment).where(
        CursusEnrollment.student_id == student.id,
        CursusEnrollment.forty_two_cursus_id.in_(tuple(to_delete)),
      )
    )


async def sync_student_data(
  session: AsyncSession,
  client: AsyncOAuth2Client,
  profile: Dict[str, Any],
) -> None:
  student = await _upsert_student(session, profile)

  user_id = profile.get("id")
  if user_id is None:
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Profile missing id")

  projects_payload = await _fetch_all(
    client,
    FORTY_TWO_PROJECTS_USERS_URL,
    {"filter[user_id]": user_id, "include": "project"},
  )
  cursus_payload = await _fetch_all(
    client,
    FORTY_TWO_CURSUS_USERS_URL,
    {"filter[user_id]": user_id, "include": "cursus"},
  )

  await _sync_projects(session, student, projects_payload)
  await _sync_cursus(session, student, cursus_payload)

  await session.commit()


def _should_store_project(data: Dict[str, Any]) -> bool:
  project = data.get("project") or {}
  name = str(project.get("name") or project.get("slug") or "").lower()
  return PISCINE_KEYWORD not in name


class _ParsedPercent:
  __slots__ = ("percent", "cleaned_name")

  def __init__(self, percent: int, cleaned_name: Optional[str]):
    self.percent = percent
    self.cleaned_name = cleaned_name


def _parse_progress_percent(name: Optional[str]) -> Optional[_ParsedPercent]:
  if not name:
    return None
  match = re.search(r"(\d{1,3})\s*$", name)
  if not match:
    return None
  percent = int(match.group(1))
  cleaned = name[: match.start()].rstrip() or None
  return _ParsedPercent(percent=min(percent, 100), cleaned_name=cleaned)
