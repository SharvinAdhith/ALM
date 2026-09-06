"""
backend/routers/jarvis.py
--------------------------
Protected JARVIS AI routes — all require a valid JWT.

Endpoints:
  POST /api/v1/jarvis/text          — text chat
  POST /api/v1/jarvis/audio         — audio upload → transcribe → chat
  GET  /api/v1/jarvis/sessions      — list user's chat sessions
  POST /api/v1/jarvis/sessions      — create a new session
  GET  /api/v1/jarvis/sessions/{id} — get all messages in a session
  PATCH /api/v1/jarvis/sessions/{id}— rename a session
  DELETE /api/v1/jarvis/sessions/{id} — delete a session
"""

import logging
import os
import shutil
import sys
from pathlib import Path
from typing import Annotated, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.dependencies import get_current_user
from backend.models.user import ChatMessage, ChatSession, User
from backend.schemas.jarvis import (
    ChatAudioResponse,
    ChatMessageOut,
    ChatSessionOut,
    ChatTextRequest,
    ChatTextResponse,
    CreateSessionRequest,
    RenameSessionRequest,
)
from backend.services.jarvis_service import jarvis_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/jarvis", tags=["jarvis"])

# Path to JARVIS/cache dir for temp audio files
_JARVIS_CACHE = Path(__file__).resolve().parents[2] / "JARVIS" / "cache"
_JARVIS_CACHE.mkdir(parents=True, exist_ok=True)


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_or_create_session(
    session_id: int | None,
    user: User,
    db: AsyncSession,
    first_message: str = "",
) -> ChatSession:
    """
    Return an existing session owned by *user* or create a new one.
    New session title is derived from the first 60 chars of the first message.
    """
    if session_id is not None:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user.id,
            )
        )
        session: ChatSession | None = result.scalar_one_or_none()
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat session not found.",
            )
        return session

    title = (first_message[:60] + "…") if len(first_message) > 60 else first_message or "New Chat"
    session = ChatSession(user_id=user.id, title=title)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def _append_message(
    db: AsyncSession,
    session_id: int,
    role: str,
    content: str,
    emotion: str | None = None,
    transcription: str | None = None,
) -> ChatMessage:
    msg = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        emotion=emotion,
        transcription=transcription,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return msg


# ── Text chat ─────────────────────────────────────────────────────────────────

@router.post(
    "/text",
    response_model=ChatTextResponse,
    summary="Send a text message to JARVIS",
)
async def chat_text(
    payload: ChatTextRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatTextResponse:
    logger.info("Text chat | user=%d | text=%.80r", user.id, payload.text)

    # ── Resolve or create session ──────────────────────────────────────────
    session = await _get_or_create_session(
        payload.session_id, user, db, first_message=payload.text
    )

    # ── Store user message ─────────────────────────────────────────────────
    user_msg = await _append_message(db, session.id, role="user", content=payload.text)

    # ── Call JARVIS brain (runs in thread pool to keep loop responsive) ────
    try:
        response_text, emotion = await jarvis_service.chat(payload.text)
    except Exception as exc:
        logger.exception("JARVIS brain error: %s", exc)
        response_text = "I encountered an internal error. Please try again."
        emotion = "error"

    # ── Store JARVIS reply ─────────────────────────────────────────────────
    jarvis_msg = await _append_message(
        db, session.id, role="jarvis", content=response_text, emotion=emotion
    )

    return ChatTextResponse(
        response=response_text,
        emotion=emotion,
        session_id=session.id,
        messages=[
            ChatMessageOut.model_validate(user_msg),
            ChatMessageOut.model_validate(jarvis_msg),
        ],
    )


# ── Audio chat ────────────────────────────────────────────────────────────────

@router.post(
    "/audio",
    response_model=ChatAudioResponse,
    summary="Send an audio recording to JARVIS",
)
async def chat_audio(
    file: UploadFile = File(..., description="Audio blob (webm/wav/mp3)"),
    session_id: int | None = Form(None),
    audio_model: str = Form("whisper-basic"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatAudioResponse:
    logger.info("Audio chat | user=%d | file=%s", user.id, file.filename)

    # ── Save uploaded audio to JARVIS cache dir ────────────────────────────
    ext = Path(file.filename or "record.webm").suffix or ".webm"
    tmp_path = _JARVIS_CACHE / f"web_input_{user.id}{ext}"
    try:
        with open(tmp_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
    finally:
        await file.close()

    # ── Transcribe + Analyse via scene_analyzer pipeline ─────────────────────
    import asyncio

    loop = asyncio.get_running_loop()
    try:
        # Import lazily (JARVIS sys.path already set by jarvis_service)
        from audio.scene_analyzer import analyze_audio_scene  # noqa: PLC0415

        scene_result: dict = await loop.run_in_executor(
            None,
            lambda: analyze_audio_scene(str(tmp_path), audio_model),
        )

        transcription: str = scene_result.get("transcription", "").strip()
        enriched_transcription: str = scene_result.get("jarvis_prompt", transcription)
        emotion_from_scene: str = scene_result.get("emotion") or "neutral"
        scene_type: str = scene_result.get("scene_type") or ""
        events_summary: str = scene_result.get("events_summary", "")

        logger.info(
            "Scene analysis | model=%s | scene=%s | noise=%s | events=%s",
            audio_model,
            scene_type,
            scene_result.get("noise_level"),
            events_summary[:60],
        )

    except Exception as exc:
        logger.exception("Scene analysis failed: %s", exc)
        return ChatAudioResponse(
            response="Audio processing pipeline failed. Please try again.",
            emotion="error",
            transcription="",
            session_id=session_id or 0,
            messages=[],
        )
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    # For BAP model, even with no transcription we have scene analysis — proceed.
    # For speech-only models, a blank transcription means nothing was heard.
    if not transcription.strip() and audio_model != "alm-full-scene":
        return ChatAudioResponse(
            response="I didn't catch that. Could you speak again? Or try the BAP Model for ambient/non-speech audio.",
            emotion="neutral",
            transcription="",
            session_id=session_id or 0,
            messages=[],
        )

    # Use spoken content for session title; fall back to scene type description
    session_label = transcription.strip() or (f"Audio scene: {scene_type}" if scene_type else "Audio analysis")
    logger.info("Audio session label: %.80r", session_label)

    # ── Resolve or create session ──────────────────────────────────────────
    session = await _get_or_create_session(
        session_id, user, db, first_message=session_label
    )

    # ── Store user message (audio transcription) ───────────────────────────
    user_display = transcription.strip() or (f"[Audio: {scene_type}]" if scene_type else "[Audio file]")
    user_msg = await _append_message(
        db, session.id, role="user", content=user_display, transcription=transcription
    )

    # ── Call JARVIS brain ──────────────────────────────────────────────────
    try:
        response_text, emotion = await jarvis_service.chat(enriched_transcription)
        # Prefer scene emotion when JARVIS brain returns generic "neutral"
        if emotion in ("neutral", "") and emotion_from_scene not in ("neutral", "", None):
            emotion = emotion_from_scene
    except Exception as exc:
        logger.exception("JARVIS brain error: %s", exc)
        response_text = "Audio processing encountered an error."
        emotion = "error"

    # ── Store JARVIS reply ─────────────────────────────────────────────────
    jarvis_msg = await _append_message(
        db, session.id, role="jarvis", content=response_text, emotion=emotion
    )

    return ChatAudioResponse(
        response=response_text,
        emotion=emotion,
        transcription=transcription,
        session_id=session.id,
        messages=[
            ChatMessageOut.model_validate(user_msg),
            ChatMessageOut.model_validate(jarvis_msg),
        ],
    )



# ── Session management ────────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=List[ChatSessionOut],
    summary="List all chat sessions for the authenticated user",
)
async def list_sessions(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[ChatSessionOut]:
    result = await db.execute(
        select(
            ChatSession,
            func.count(ChatMessage.id).label("message_count"),
        )
        .outerjoin(ChatMessage, ChatMessage.session_id == ChatSession.id)
        .where(ChatSession.user_id == user.id)
        .group_by(ChatSession.id)
        .order_by(ChatSession.updated_at.desc())
    )
    rows = result.all()

    sessions_out = []
    for row in rows:
        session_obj, msg_count = row
        s = ChatSessionOut.model_validate(session_obj)
        s.message_count = msg_count
        sessions_out.append(s)
    return sessions_out


@router.post(
    "/sessions",
    response_model=ChatSessionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new chat session",
)
async def create_session(
    payload: CreateSessionRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatSessionOut:
    session = ChatSession(user_id=user.id, title=payload.title)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    s = ChatSessionOut.model_validate(session)
    s.message_count = 0
    return s


@router.get(
    "/sessions/{session_id}",
    response_model=List[ChatMessageOut],
    summary="Get all messages in a session",
)
async def get_session_messages(
    session_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[ChatMessageOut]:
    # Verify ownership
    sess_result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user.id,
        )
    )
    if not sess_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found.")

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = result.scalars().all()
    return [ChatMessageOut.model_validate(m) for m in messages]


@router.patch(
    "/sessions/{session_id}",
    response_model=ChatSessionOut,
    summary="Rename a chat session",
)
async def rename_session(
    session_id: int,
    payload: RenameSessionRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatSessionOut:
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user.id,
        )
    )
    session: ChatSession | None = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    session.title = payload.title
    await db.flush()
    await db.refresh(session)
    s = ChatSessionOut.model_validate(session)
    s.message_count = 0  # not needed on rename response
    return s


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat session and all its messages",
)
async def delete_session(
    session_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user.id,
        )
    )
    session: ChatSession | None = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    await db.delete(session)


# ── Welcome message ──────────────────────────────────────────────────────────

@router.get(
    "/welcome",
    summary="Get a personalised welcome message for the current user",
)
async def get_welcome(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Returns a personalised greeting.
    is_new=True when the user has no previous sessions (first ever login).
    """
    # Count existing sessions to determine if this is a new user
    count_result = await db.execute(
        select(func.count(ChatSession.id)).where(ChatSession.user_id == user.id)
    )
    session_count = count_result.scalar() or 0
    is_new = session_count == 0

    first_name = user.name.split()[0] if user.name else "there"

    if is_new:
        message = (
            f"Hello {first_name}! I'm JARVIS — your personal AI assistant. "
            "I can chat with you, remember things you tell me, search the web, "
            "open apps, and much more. What can I help you with today?"
        )
    else:
        message = f"Welcome back, {first_name}! Good to see you again. What's on your mind?"

    return {"message": message, "is_new": is_new, "user_name": first_name}


# ── SSE Streaming chat ──────────────────────────────────────────────────────

from fastapi.responses import StreamingResponse


@router.post(
    "/stream",
    summary="Stream a text response from JARVIS via Server-Sent Events",
)
async def chat_stream(
    payload: ChatTextRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    SSE streaming endpoint — sends JARVIS's response token-by-token.
    Each token is sent as a Server-Sent Event (SSE) in the format:
        data: <token>\n\n
    The stream ends with:
        data: [DONE]\n\n
    """
    logger.info("Stream chat | user=%d | text=%.80r", user.id, payload.text)

    # Resolve or create session (runs while DI db session is still alive)
    session = await _get_or_create_session(
        payload.session_id, user, db, first_message=payload.text
    )

    # Store user message (runs while DI db session is still alive)
    await _append_message(db, session.id, role="user", content=payload.text)

    # Capture IDs before the DI session closes
    session_id = session.id

    async def event_generator():
        full_response = []
        try:
            async for token in jarvis_service.chat_stream(payload.text):
                full_response.append(token)
                # SSE format: data: <content>\n\n
                yield f"data: {token}\n\n"
        except Exception as exc:
            logger.exception("Stream error: %s", exc)
            yield f"data: [ERROR]\n\n"

        # Signal end of stream
        yield f"data: [DONE]\n\n"

        # ── Save JARVIS response using a FRESH db session ──────────────
        # The DI-injected `db` session is already committed/closed by now
        # (FastAPI closes dependencies when the handler returns StreamingResponse).
        # So we create an independent session for this write.
        joined = "".join(full_response)
        if joined:
            from backend.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as save_db:
                try:
                    save_msg = ChatMessage(
                        session_id=session_id,
                        role="jarvis",
                        content=joined,
                        emotion="neutral",
                    )
                    save_db.add(save_msg)
                    await save_db.commit()
                except Exception as exc:
                    logger.exception("Failed to save streamed response: %s", exc)
                    await save_db.rollback()

        # Send session_id as final metadata event
        yield f"event: meta\ndata: {session_id}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Analytics ────────────────────────────────────────────────────────────────

@router.get(
    "/analytics",
    summary="Get chat analytics for the authenticated user",
)
async def get_analytics(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Returns aggregated chat statistics for the current user:
    - Total sessions, messages, avg message length
    - Message breakdown by role (user vs jarvis)
    - Emotion distribution from JARVIS responses
    - Recent activity timeline
    """
    from sqlalchemy import case, cast, Float

    # Total sessions
    sess_count_result = await db.execute(
        select(func.count(ChatSession.id)).where(ChatSession.user_id == user.id)
    )
    total_sessions = sess_count_result.scalar() or 0

    # Total messages across all user sessions
    msg_count_result = await db.execute(
        select(func.count(ChatMessage.id))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(ChatSession.user_id == user.id)
    )
    total_messages = msg_count_result.scalar() or 0

    # Messages by role
    role_counts_result = await db.execute(
        select(ChatMessage.role, func.count(ChatMessage.id))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(ChatSession.user_id == user.id)
        .group_by(ChatMessage.role)
    )
    role_breakdown = {role: count for role, count in role_counts_result.all()}

    # Average message length (JARVIS responses)
    avg_len_result = await db.execute(
        select(func.avg(func.length(ChatMessage.content)))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(ChatSession.user_id == user.id, ChatMessage.role == "jarvis")
    )
    avg_response_length = round(avg_len_result.scalar() or 0, 1)

    # Emotion distribution
    emotion_result = await db.execute(
        select(ChatMessage.emotion, func.count(ChatMessage.id))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(
            ChatSession.user_id == user.id,
            ChatMessage.role == "jarvis",
            ChatMessage.emotion.isnot(None),
        )
        .group_by(ChatMessage.emotion)
    )
    emotion_distribution = {
        emotion: count for emotion, count in emotion_result.all() if emotion
    }

    # Recent 7 sessions with message counts
    recent_result = await db.execute(
        select(
            ChatSession.title,
            ChatSession.created_at,
            func.count(ChatMessage.id).label("msg_count"),
        )
        .outerjoin(ChatMessage, ChatMessage.session_id == ChatSession.id)
        .where(ChatSession.user_id == user.id)
        .group_by(ChatSession.id)
        .order_by(ChatSession.created_at.desc())
        .limit(7)
    )
    recent_sessions = [
        {"title": title, "created_at": str(created_at), "messages": msg_count}
        for title, created_at, msg_count in recent_result.all()
    ]

    return {
        "total_sessions": total_sessions,
        "total_messages": total_messages,
        "user_messages": role_breakdown.get("user", 0),
        "jarvis_messages": role_breakdown.get("jarvis", 0),
        "avg_response_length": avg_response_length,
        "emotion_distribution": emotion_distribution,
        "recent_sessions": recent_sessions,
    }


