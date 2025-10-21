from __future__ import annotations

from urllib.parse import urlencode

from fastapi import FastAPI, Form, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import vibes
from .errors import DatabaseError, EmbeddingError

app = FastAPI(title="42Quackform Vibes")

templates = Jinja2Templates(directory="app/templates")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


async def _load_vibes(limit: int = 20):
    try:
        return await run_in_threadpool(vibes.list_vibes, limit)
    except DatabaseError as exc:
        raise exc


@app.get("/", response_class=HTMLResponse)
async def index(request: Request, message: str | None = None, error: str | None = None):
    try:
        existing = await _load_vibes()
    except DatabaseError as exc:
        error = error or str(exc)
        existing = []

    context = {
        "request": request,
        "vibes": existing,
        "results": None,
        "query": None,
        "message": message,
        "error": error,
    }
    return templates.TemplateResponse("index.html", context)


@app.post("/vibes")
async def create_vibe(uid: str = Form(...), vibe_text: str = Form(...)):
    try:
        await run_in_threadpool(vibes.upsert_vibe, uid, vibe_text)
    except EmbeddingError as exc:
        params = urlencode({"error": str(exc)})
        return RedirectResponse(url=f"/?{params}", status_code=303)
    except DatabaseError as exc:
        params = urlencode({"error": str(exc)})
        return RedirectResponse(url=f"/?{params}", status_code=303)

    params = urlencode({"message": f"Saved vibe for {uid}."})
    return RedirectResponse(url=f"/?{params}", status_code=303)


@app.post("/search", response_class=HTMLResponse)
async def search_vibes(request: Request, query: str = Form(...), top_k: int = Form(5)):
    message: str | None = None
    error: str | None = None
    results = []

    try:
        results = await run_in_threadpool(vibes.search_vibes, query, top_k)
    except EmbeddingError as exc:
        error = str(exc)
    except DatabaseError as exc:
        error = str(exc)

    try:
        existing = await _load_vibes()
    except DatabaseError as exc:
        error = error or str(exc)
        existing = []

    context = {
        "request": request,
        "vibes": existing,
        "results": results,
        "query": query,
        "message": message,
        "error": error,
    }
    return templates.TemplateResponse("index.html", context)
