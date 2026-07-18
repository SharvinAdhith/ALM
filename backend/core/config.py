"""
backend/core/config.py
----------------------
Centralised settings loaded from backend/.env using pydantic-settings.
Every module reads settings via `from backend.core.config import settings`.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── JWT ──────────────────────────────────────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days default

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./jarvis_users.db"

    # ── Google OAuth (optional, stub) ─────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # ── Azure AI (needed by backend for JARVIS service) ───────────────────────
    AZURE_SPEECH_KEY: str = ""
    AZURE_REGION: str = ""
    AZURE_OPENAI_KEY: str = ""
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = ""
    AZURE_OPENAI_EMBED_ENDPOINT: str = ""
    AZURE_OPENAI_EMBED_DEPLOYMENT: str = ""

    model_config = SettingsConfigDict(
        # Resolve .env relative to this file's directory (backend/.env)
        env_file=str(Path(__file__).resolve().parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    return Settings()


# Convenience alias used throughout the app
settings: Settings = get_settings()
