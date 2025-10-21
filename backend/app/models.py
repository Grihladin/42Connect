from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
  pass


class Student(Base):
  __tablename__ = "students"

  id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
  forty_two_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
  login: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
  display_name: Mapped[str | None] = mapped_column(String(255))
  email: Mapped[str | None] = mapped_column(String(255))
  image_url: Mapped[str | None] = mapped_column(Text())
  campus: Mapped[str | None] = mapped_column(String(255))
  created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
  )
  updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
    onupdate=func.now(),
  )

  projects: Mapped[list["Project"]] = relationship(back_populates="student", cascade="all, delete-orphan")
  cursus_enrollments: Mapped[list["CursusEnrollment"]] = relationship(back_populates="student", cascade="all, delete-orphan")


class Project(Base):
  __tablename__ = "projects"

  id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
  student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
  forty_two_project_user_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
  forty_two_project_id: Mapped[int | None] = mapped_column(BigInteger)
  slug: Mapped[str | None] = mapped_column(String(255))
  name: Mapped[str | None] = mapped_column(String(255))
  status: Mapped[str | None] = mapped_column(String(64), index=True)
  validated: Mapped[bool | None] = mapped_column(Boolean)
  final_mark: Mapped[int | None] = mapped_column(Integer)
  progress_percent: Mapped[int | None] = mapped_column(Integer)
  marked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
  synced_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
    onupdate=func.now(),
  )

  student: Mapped["Student"] = relationship(back_populates="projects")


class CursusEnrollment(Base):
  __tablename__ = "cursus_enrollments"

  id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
  student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
  forty_two_cursus_id: Mapped[int | None] = mapped_column(BigInteger)
  name: Mapped[str | None] = mapped_column(String(255))
  grade: Mapped[str | None] = mapped_column(String(64))
  began_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
  ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
  synced_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
    onupdate=func.now(),
  )

  student: Mapped["Student"] = relationship(back_populates="cursus_enrollments")
