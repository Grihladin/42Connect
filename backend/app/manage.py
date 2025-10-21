from __future__ import annotations

import argparse
import asyncio

from dotenv import load_dotenv

load_dotenv()

from .database import engine
from .models import Base


async def init_db() -> None:
  async with engine.begin() as connection:
    await connection.run_sync(Base.metadata.create_all)


async def drop_db() -> None:
  async with engine.begin() as connection:
    await connection.run_sync(Base.metadata.drop_all)


def main() -> None:
  parser = argparse.ArgumentParser(description="Management commands for the 42 login backend.")
  parser.add_argument("command", choices=["init-db", "drop-db"], help="Command to run.")
  args = parser.parse_args()

  if args.command == "init-db":
    asyncio.run(init_db())
  elif args.command == "drop-db":
    asyncio.run(drop_db())


if __name__ == "__main__":
  main()
