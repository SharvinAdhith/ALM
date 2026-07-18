"""
nlp/_azure_client.py
---------------------
Shared, lazily-initialized Azure OpenAI client factory.

PROBLEM THIS SOLVES:
  The original code loaded AZURE_OPENAI_* env vars at module level:
      AZURE_API_KEY = os.getenv("AZURE_OPENAI_KEY")   # ← runs once at import
  This meant changing .env required a full process restart AND clearing
  __pycache__. It also made the vars None if dotenv hadn't been loaded yet.

SOLUTION:
  build_client() reads env vars fresh every time it is called AND calls
  load_dotenv() itself, so it always reflects the current .env file.
  The client is cached per (api_key, endpoint) pair so repeated calls
  within the same process are free.

USAGE (in any JARVIS nlp module):
    from nlp._azure_client import build_client, get_deployment
    client = build_client()
    deployment = get_deployment()
"""

import os
from functools import lru_cache
from dotenv import load_dotenv
from openai import OpenAI

# Load .env on every import (safe to call multiple times — dotenv is idempotent)
load_dotenv(override=False)


def _read_config() -> dict:
    """Read Azure config fresh from environment (after dotenv load)."""
    # Reload so the latest .env values are always available
    load_dotenv(override=True)
    return {
        "api_key":    os.getenv("AZURE_OPENAI_KEY", ""),
        "endpoint":   os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/") + "/",
        "deployment": os.getenv("AZURE_OPENAI_DEPLOYMENT", ""),
    }


@lru_cache(maxsize=8)
def _cached_client(api_key: str, endpoint: str) -> OpenAI:
    """
    Return a cached OpenAI client for the given (api_key, endpoint) pair.
    lru_cache ensures we don't create a new client on every call — only when
    the credentials actually change.
    """
    if not api_key or not endpoint:
        raise ValueError(
            "Azure OpenAI configuration incomplete. "
            "Check AZURE_OPENAI_KEY and AZURE_OPENAI_ENDPOINT in your .env file."
        )
    return OpenAI(api_key=api_key, base_url=endpoint)


def build_client() -> OpenAI:
    """
    Return an Azure OpenAI client using current .env values.
    Safe to call on every request — uses lru_cache internally.
    """
    cfg = _read_config()
    return _cached_client(cfg["api_key"], cfg["endpoint"])


def get_deployment() -> str:
    """Return the deployment name (model) from current .env."""
    load_dotenv(override=True)
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")
    if not deployment:
        raise ValueError(
            "AZURE_OPENAI_DEPLOYMENT not set. "
            "Set it in JARVIS/.env — e.g. gpt-5.4-mini"
        )
    return deployment


def validate_config() -> bool:
    """
    Quick sanity check — returns True if all required vars are present.
    Useful for startup diagnostics.
    """
    load_dotenv(override=True)
    required = [
        "AZURE_OPENAI_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_DEPLOYMENT",
    ]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        print(f"[_azure_client] Missing env vars: {missing}")
        return False
    return True
