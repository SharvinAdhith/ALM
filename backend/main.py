"""
backend/main.py
---------------
FastAPI application entrypoint.

Run from e:/Minialm/:
    uvicorn backend.main:app --reload --port 8000
"""

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Logging setup (before any other import that logs) ────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("backend")

# ── Import app modules ────────────────────────────────────────────────────────
from backend.core.config import settings  # noqa: E402
from backend.core.database import Base, engine  # noqa: E402
from backend.routers import auth, jarvis  # noqa: E402
from backend.services.jarvis_service import jarvis_service  # noqa: E402


# ── Lifespan: startup + shutdown ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.
    All startup steps run before `yield`; shutdown steps after.
    """
    logger.info("=== JARVIS Backend starting up ===")

    # 1. Create all DB tables (idempotent — safe to run every time)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified / created.")

    # 2. Boot JARVIS brain (loads NLP, memory, embeddings, RAG, tools)
    jarvis_service.initialize()

    yield  # ←── Application runs here ──────────────────────────────────────

    # Shutdown
    logger.info("=== JARVIS Backend shutting down ===")
    await engine.dispose()


# ── FastAPI application ───────────────────────────────────────────────────────
app = FastAPI(
    title="JARVIS AI Backend",
    description=(
        "Production backend for the JARVIS Audio Language Model frontend. "
        "Provides JWT authentication, user-scoped chat history, and a "
        "protected gateway to the JARVIS core brain."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# For local development: allow the Vite dev server.
# In production: restrict to your actual frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:4173",   # Vite preview
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s: %s", request.method, request.url, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred."},
    )


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(jarvis.router)


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"], summary="Backend health check")
async def health() -> dict:
    return {"status": "ok", "service": "JARVIS Backend", "version": "1.0.0"}


# ── Entry point (direct execution) ───────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
