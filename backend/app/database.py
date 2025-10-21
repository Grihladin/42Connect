from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from .config import get_settings


def _create_engine() -> AsyncEngine:
  settings = get_settings()
  return create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
  )


engine: AsyncEngine = _create_engine()
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncSession:
  async with AsyncSessionLocal() as session:
    yield session
