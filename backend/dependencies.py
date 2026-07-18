"""
backend/dependencies.py
-----------------------
Shared FastAPI dependencies used across routers.
"""

import logging
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.security import decode_access_token
from backend.models.user import User

logger = logging.getLogger(__name__)

# OAuth2-compatible Bearer scheme
_bearer = HTTPBearer(auto_error=True)

_401 = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or expired token.",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """
    FastAPI dependency that:
      1. Extracts the Bearer token from the Authorization header.
      2. Decodes and verifies the JWT.
      3. Loads the corresponding User from the database.
      4. Raises HTTP 401 on any failure.

    Inject with: `user: Annotated[User, Depends(get_current_user)]`
    """
    email = decode_access_token(credentials.credentials)
    if not email:
        raise _401

    result = await db.execute(select(User).where(User.email == email))
    user: User | None = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise _401

    return user
