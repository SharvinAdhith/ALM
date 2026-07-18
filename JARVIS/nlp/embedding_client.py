# nlp/embedding_client.py
"""
Azure OpenAI embedding client.
Uses AZURE_OPENAI_EMBED_DEPLOYMENT (text-embedding-3-small) via the shared client factory.
"""

import os
from typing import List
from functools import lru_cache
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(override=True)


def _sanitize_endpoint(url: str) -> str:
    """
    Strip any path suffix so we get just the resource base URL.
    e.g. https://jarvis-brain.openai.azure.com/openai/v1/ -> https://jarvis-brain.openai.azure.com
    """
    if not url:
        return url
    marker = "/openai/"
    i = url.find(marker)
    if i != -1:
        return url[:i]
    return url.rstrip("/")


@lru_cache(maxsize=4)
def _cached_embed_client(api_key: str, endpoint: str) -> OpenAI:
    return OpenAI(api_key=api_key, base_url=f"{endpoint}/openai/v1/")


def _build_embed_client() -> tuple:
    """Return (client, deployment) freshly from .env."""
    load_dotenv(override=True)

    api_key = os.getenv("AZURE_OPENAI_KEY", "")
    raw_endpoint = os.getenv("AZURE_OPENAI_EMBED_ENDPOINT") or os.getenv("AZURE_OPENAI_ENDPOINT", "")
    deployment = os.getenv("AZURE_OPENAI_EMBED_DEPLOYMENT", "")

    if not (api_key and raw_endpoint and deployment):
        raise ValueError(
            "Azure embedding config incomplete. "
            "Set AZURE_OPENAI_KEY, AZURE_OPENAI_EMBED_ENDPOINT, "
            "and AZURE_OPENAI_EMBED_DEPLOYMENT in JARVIS/.env"
        )

    endpoint = _sanitize_endpoint(raw_endpoint)
    client = _cached_embed_client(api_key, endpoint)
    return client, deployment


class EmbeddingClient:
    """
    Thin wrapper over Azure OpenAI Embeddings.
    Requires a separate embeddings deployment (AZURE_OPENAI_EMBED_DEPLOYMENT).
    Client is lazily initialized at first call — always reflects current .env.
    """

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Returns one embedding vector per input text as plain Python floats."""
        if isinstance(texts, str):
            texts = [texts]

        client, deployment = _build_embed_client()

        resp = client.embeddings.create(model=deployment, input=texts)

        vectors: List[List[float]] = []
        for d in resp.data:
            vec = d.embedding
            if hasattr(vec, "tolist"):
                vec = vec.tolist()
            vectors.append([float(x) for x in vec])
        return vectors
