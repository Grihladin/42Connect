#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

import typer

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import vibes
from app.errors import DatabaseError, EmbeddingError

app = typer.Typer(help="Manage vibes stored in PostgreSQL with pgvector embeddings.")


@app.command()
def upsert(uid: str, vibe: str) -> None:
    """Insert or replace a vibe associated with a uid."""
    try:
        vibes.upsert_vibe(uid, vibe)
    except EmbeddingError as exc:
        raise typer.BadParameter(str(exc)) from exc
    except DatabaseError as exc:
        raise typer.Exit(code=1) from exc

    typer.echo(f"Stored vibe for '{uid}'.")


@app.command()
def fetch(uid: str) -> None:
    """Retrieve a vibe by uid."""
    try:
        record = vibes.fetch_vibe(uid)
    except DatabaseError as exc:
        raise typer.Exit(code=1) from exc

    if not record:
        typer.echo(f"No vibe found for uid '{uid}'.")
        raise typer.Exit(code=1)

    typer.echo(f"uid: {record.uid}")
    typer.echo(f"model: {record.embedding_model}")
    typer.echo(f"created_at: {record.created_at}")
    typer.echo(f"updated_at: {record.updated_at}")
    typer.echo("original vibe:")
    typer.echo(record.original_vibe)
    typer.echo("processed vibe:")
    typer.echo(record.processed_vibe)


@app.command()
def search(query: str, top_k: int = typer.Option(5, min=1, max=50)) -> None:
    """Search for similar vibes using cosine distance."""
    try:
        results = vibes.search_vibes(query, top_k=top_k)
    except EmbeddingError as exc:
        raise typer.BadParameter(str(exc)) from exc
    except DatabaseError as exc:
        raise typer.Exit(code=1) from exc

    if not results:
        typer.echo("No vibes stored yet.")
        raise typer.Exit(code=0)

    for idx, result in enumerate(results, start=1):
        typer.echo(
            f"{idx}. uid={result.uid} | similarity={result.similarity:.3f} | model={result.embedding_model}"
        )
        typer.echo(f"   original: {result.original_vibe}")
        typer.echo(f"   processed: {result.processed_vibe}")


@app.command()
def list_uids() -> None:
    """List all stored uids."""
    try:
        records = vibes.list_vibes(limit=100)
    except DatabaseError as exc:
        raise typer.Exit(code=1) from exc

    if not records:
        typer.echo("No vibes stored.")
        return

    for record in sorted(records, key=lambda v: v.uid.lower()):
        typer.echo(record.uid)


@app.command()
def wipe(confirm: bool = typer.Option(False, "--confirm", help="Skip confirmation prompt.")) -> None:
    """Delete every stored vibe."""
    if not confirm:
        confirmed = typer.confirm(
            "This will delete all stored vibes. Are you sure you want to continue?"
        )
        if not confirmed:
            typer.echo("Aborted.")
            raise typer.Exit(code=0)

    try:
        vibes.wipe_vibes()
    except DatabaseError as exc:
        raise typer.Exit(code=1) from exc

    typer.echo("All vibes deleted.")


if __name__ == "__main__":
    app()
