"""
backend/core/database.py
------------------------
SQLAlchemy async engine + session factory.
Supports SQLite (default) and PostgreSQL (production swap).
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.core.config import settings

# ── Engine ───────────────────────────────────────────────────────────────────
# check_same_thread=False is a SQLite-only arg; harmless if omitted for PG.
connect_args = (
    {"check_same_thread": False}
    if settings.DATABASE_URL.startswith("sqlite")
    else {}
)

engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,          # Set True to log SQL statements during debug
    pool_pre_ping=True,  # Detect stale connections
)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Declarative base shared by all ORM models ─────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── FastAPI dependency ─────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a DB session for the duration of a request, then close it."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
