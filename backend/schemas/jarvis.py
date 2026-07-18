"""
backend/schemas/jarvis.py
-------------------------
Pydantic v2 schemas for JARVIS chat routes and session/history management.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# ── Inbound requests ──────────────────────────────────────────────────────────

class ChatTextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096)
    session_id: Optional[int] = Field(
        None,
        description="Existing session to append to. Omit to auto-create a new one.",
    )


# ── Outbound responses ────────────────────────────────────────────────────────

class ChatMessageOut(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    emotion: Optional[str] = None
    transcription: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatTextResponse(BaseModel):
    response: str
    emotion: str
    session_id: int
    messages: List[ChatMessageOut]  # last two messages (user + jarvis)


class ChatAudioResponse(BaseModel):
    response: str
    emotion: str
    transcription: str
    session_id: int
    messages: List[ChatMessageOut]


# ── Session schemas ───────────────────────────────────────────────────────────

class ChatSessionOut(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


class CreateSessionRequest(BaseModel):
    title: str = Field("New Chat", max_length=255)


class RenameSessionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
