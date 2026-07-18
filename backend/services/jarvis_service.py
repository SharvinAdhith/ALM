"""
backend/services/jarvis_service.py
------------------------------------
JARVIS brain singleton for the FastAPI backend.

Design decisions:
  1. SilentSpeechEngine is used — TTS is suppressed server-side.
     The browser handles audio via the Web Speech API (synthesizeSpeech in Chat.jsx).

  2. The JARVIS core modules (nlp/, memory/, audio/, speech/, tools/) are imported
     directly (same Python process). This gives zero-latency access vs HTTP proxy.

  3. sys.path is extended to include the JARVIS/ directory so that relative imports
     inside JARVIS (e.g. `from tools.app_manager import AppManager`) continue to
     work whether you run the backend from e:/Minialm or any cwd.

  4. JARVIS global memory (memory.json, vector_store/) are intentionally kept shared.
     They represent the AI's own persistent knowledge base. Per-user chat history
     is stored separately in the SQLite database via ChatSession / ChatMessage models.

  5. brain.route() is called from a ThreadPoolExecutor because CoreBrain is synchronous
     and contains blocking I/O (OpenAI calls, file writes). Running it in a thread
     keeps FastAPI's async event loop responsive under concurrent requests.
"""

import asyncio
import logging
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Tuple

logger = logging.getLogger(__name__)

# ── Path setup ──────────────────────────────────────────────────────────────
# Ensure the JARVIS/ directory is in sys.path so all its intra-package imports work
_JARVIS_ROOT = str(Path(__file__).resolve().parents[2] / "JARVIS")
if _JARVIS_ROOT not in sys.path:
    sys.path.insert(0, _JARVIS_ROOT)

# Allow JARVIS/ .env to be loaded for its own dotenv calls
os.chdir(_JARVIS_ROOT)


# ── Thread pool for blocking JARVIS ops ─────────────────────────────────────
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="jarvis-worker")


class JARVISService:
    """
    Singleton wrapper around the JARVIS CoreBrain.

    Usage:
        from backend.services.jarvis_service import jarvis_service
        response, emotion = await jarvis_service.chat(text)
    """

    _instance: "JARVISService | None" = None

    def __new__(cls) -> "JARVISService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def initialize(self) -> None:
        """
        Boot all JARVIS subsystems. Called once during FastAPI lifespan startup.
        Importing here (not at module level) avoids heavy model loading on import.
        """
        if self._initialized:
            return

        logger.info("Booting JARVIS core subsystems for FastAPI backend...")

        # ── Lazy imports — happen only when initialize() is called ─────────
        from speech.speech_engine import SilentSpeechEngine  # noqa: PLC0415
        from memory.memory_engine import MemoryEngine  # noqa: PLC0415
        from nlp.nlp_engine import NLPEngine  # noqa: PLC0415
        from nlp.gpt_response import GPTResponder  # noqa: PLC0415
        from nlp.embedding_client import EmbeddingClient  # noqa: PLC0415
        from memory.semantic_memory import SemanticMemory  # noqa: PLC0415
        from memory.rag_retriever import RAGRetriever  # noqa: PLC0415
        from tools.function_router import FunctionRouter  # noqa: PLC0415
        from nlp.indent_nlp import CoreBrain  # noqa: PLC0415

        speaker = SilentSpeechEngine()          # ← No TTS in API mode
        memory = MemoryEngine()
        nlp = NLPEngine()
        embedder = EmbeddingClient()
        semantic = SemanticMemory(
            embedder,
            persist_dir="vector_store",
            collection_name="jarvis_memories",
        )
        gpt_responder = GPTResponder(memory)
        rag = RAGRetriever(semantic, gpt_responder, decay_days=30.0)
        tool_router = FunctionRouter(gpt_responder, memory, allowed_read_dirs=["."])

        self._brain = CoreBrain(
            memory, speaker, nlp, semantic, gpt_responder, rag,
            tool_router=tool_router
        )

        self._initialized = True
        logger.info("JARVIS core ready.")

    # ── Public API ──────────────────────────────────────────────────────────
    async def chat(self, text: str) -> Tuple[str, str]:
        """
        Process *text* through the JARVIS brain.

        Returns (response_text, emotion_label).
        Runs synchronous CoreBrain.route() in a thread pool to avoid
        blocking the async event loop.
        """
        if not self._initialized:
            raise RuntimeError("JARVISService not initialized. Call initialize() first.")

        loop = asyncio.get_running_loop()
        intents, data = await loop.run_in_executor(
            _executor,
            lambda: self._get_intents_and_data(text),
        )
        response, emotion = await loop.run_in_executor(
            _executor,
            lambda: self._brain.route(intents, data),
        )
        return response, emotion

    def _get_intents_and_data(self, text: str):
        """(Blocking) parse intents from text."""
        # Access nlp via brain reference — avoids re-importing
        return self._brain.nlp.parse(text)


# Module-level singleton instance — import this everywhere
jarvis_service = JARVISService()
