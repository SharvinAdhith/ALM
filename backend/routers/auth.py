"""
backend/routers/auth.py
------------------------
Authentication routes — register + login.
Paths match exactly what the React frontend calls:
  POST /api/v1/auth/register
  POST /api/v1/auth/authenticate
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.security import create_access_token, hash_password, verify_password
from backend.models.user import User
from backend.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# ── Register ─────────────────────────────────────────────────────────────────
@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new JARVIS account",
)
async def register(
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    # Check for duplicate email
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    await db.flush()          # Assign id without committing yet
    await db.refresh(user)    # Populate server defaults (created_at etc.)

    token = create_access_token(subject=user.email)
    logger.info("New user registered: %s (id=%d)", user.email, user.id)

    return TokenResponse(token=token, user=UserOut.model_validate(user))


# ── Login / Authenticate ──────────────────────────────────────────────────────
@router.post(
    "/authenticate",
    response_model=TokenResponse,
    summary="Login and receive a JWT",
)
async def authenticate(
    payload: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user: User | None = result.scalar_one_or_none()

    # Unified error — do not reveal whether email exists
    _bad_creds = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
    )

    if not user or not user.is_active:
        raise _bad_creds

    if not verify_password(payload.password, user.hashed_password):
        raise _bad_creds

    token = create_access_token(subject=user.email)
    logger.info("User authenticated: %s (id=%d)", user.email, user.id)

    return TokenResponse(token=token, user=UserOut.model_validate(user))


# ── Google OAuth ──────────────────────────────────────────────────────────────
# Flow:
#   1. Browser → GET /api/v1/auth/google            → 302 to Google
#   2. Google  → GET /api/v1/auth/google/callback   → exchange code → JWT
#   3. Backend → 302 to http://localhost:5173/chat?token=JWT&name=...
#                Frontend reads token from URL and calls login()

import httpx
from urllib.parse import urlencode, quote_plus
from fastapi.responses import RedirectResponse
from backend.core.config import settings

_GOOGLE_AUTH_URL    = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL   = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO    = "https://www.googleapis.com/oauth2/v3/userinfo"
_REDIRECT_URI       = "http://localhost:8000/api/v1/auth/google/callback"
_FRONTEND_CHAT      = "http://localhost:5173/chat"


@router.get("/google", summary="Redirect to Google OAuth consent screen")
async def google_login():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID in backend/.env",
        )
    params = {
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "redirect_uri":  _REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "online",
        "prompt":        "select_account",
    }
    url = f"{_GOOGLE_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url)


@router.get("/google/callback", summary="Handle Google OAuth callback")
async def google_callback(
    code: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # ── Exchange auth code for tokens ──────────────────────────────────────
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code":          code,
                "client_id":     settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri":  _REDIRECT_URI,
                "grant_type":    "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            logger.error("Google token exchange failed: %s", token_resp.text)
            return RedirectResponse(f"{_FRONTEND_CHAT}?error=google_auth_failed")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return RedirectResponse(f"{_FRONTEND_CHAT}?error=no_access_token")

        # ── Fetch Google user info ─────────────────────────────────────────
        info_resp = await client.get(
            _GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if info_resp.status_code != 200:
            return RedirectResponse(f"{_FRONTEND_CHAT}?error=userinfo_failed")

        info = info_resp.json()

    email = info.get("email", "")
    name  = info.get("name", email.split("@")[0])

    if not email:
        return RedirectResponse(f"{_FRONTEND_CHAT}?error=no_email")

    # ── Find or create user ────────────────────────────────────────────────
    result  = await db.execute(select(User).where(User.email == email))
    user    = result.scalar_one_or_none()
    is_new  = user is None

    if is_new:
        user = User(
            name=name,
            email=email,
            hashed_password="",   # OAuth users have no password
            is_active=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        logger.info("New Google OAuth user: %s (id=%d)", email, user.id)
    else:
        logger.info("Google OAuth login: %s (id=%d)", email, user.id)

    jwt = create_access_token(subject=email)

    # ── Redirect to frontend with token in URL ─────────────────────────────
    # Frontend reads ?token= and ?user_name= then cleans the URL
    redirect_url = (
        f"{_FRONTEND_CHAT}"
        f"?token={quote_plus(jwt)}"
        f"&user_name={quote_plus(name)}"
        f"&user_email={quote_plus(email)}"
        f"{'&new=1' if is_new else ''}"
    )
    return RedirectResponse(redirect_url)

