# memory/semantic_memory.py
import os
import uuid
import datetime as dt
from typing import List, Dict, Any, Optional

import chromadb
from chromadb.config import Settings

def _to_float_list(vec) -> List[float]:
    if hasattr(vec, "tolist"):
        vec = vec.tolist()
    return [float(x) for x in vec]

def _sanitize_metadata(meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    meta = meta or {}
    clean: Dict[str, Any] = {}
    for k, v in meta.items():
        if v is None:
            continue
        if isinstance(v, (str, int, float, bool)):
            clean[k] = v
        else:
            clean[k] = str(v)
    return clean

class SemanticMemory:
    """
    ChromaDB-backed semantic memory.
    Stores:
      - document (text)
      - embedding (provided from embedding client)
      - metadata (timestamp, source, intent, emotion, etc.)
    """                            

    def __init__(self, embedder, persist_dir: str = "vector_store", collection_name: str = "jarvis_memories"):
        os.makedirs(persist_dir, exist_ok=True)
        self.embedder = embedder

        # For stability, use Chroma 0.4.x (pin via pip). 0.5.x has breaking changes.
        self.client = chromadb.PersistentClient(path=persist_dir, settings=Settings(allow_reset=False))

        # cosine space for semantic similarity
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def add_memory(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        if not text or not text.strip():
            return ""
        meta = _sanitize_metadata(metadata)
        if "timestamp" not in meta:
            meta["timestamp"] = dt.datetime.utcnow().isoformat() + "Z"

        emb = self.embedder.embed_texts([text])[0]
        emb = _to_float_list(emb)

        _id = str(uuid.uuid4())

        self.collection.add(
            ids=[_id],
            documents=[text],
            metadatas=[meta],
            embeddings=[emb],
        )
        return _id

    def search(self, query: str, top_k: int = 5, min_similarity: float = 0.35) -> List[Dict[str, Any]]:
        """
        Returns a list of {text, similarity, metadata}
        Similarity = 1 - distance (cosine distance).
        """
        if not query or not query.strip():
            return []

        q_emb = self.embedder.embed_texts([query])[0]
        q_emb = _to_float_list(q_emb)

        res = self.collection.query(
            query_embeddings=[q_emb],
            n_results=top_k,
            include=["documents", "distances", "metadatas"]
        )

        docs = res.get("documents", [[]])[0] or []
        dists = res.get("distances", [[]])[0] or []
        metas = res.get("metadatas", [[]])[0] or []

        out: List[Dict[str, Any]] = []
        for doc, dist, meta in zip(docs, dists, metas):
            try:
                sim = 1.0 - float(dist)
            except Exception:
                continue
            if sim >= min_similarity:
                out.append({"text": doc, "similarity": sim, "metadata": meta or {}})
        return out

    def build_context_block(self, results: List[Dict[str, Any]], max_items: int = 6) -> str:
        """
        Formats retrieval results into a compact context for the LLM prompt.
        """
        if not results:
            return ""
        lines = []
        for r in results[:max_items]:
            meta = r.get("metadata") or {}
            ts = meta.get("timestamp", "")
            src = meta.get("source", "")
            intent = meta.get("intent", "")
            lines.append(f"- [{ts} | {src} | {intent}] {r['text']}")
        return "\n".join(lines)
