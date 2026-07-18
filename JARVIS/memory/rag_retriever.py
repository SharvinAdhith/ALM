# memory/rag_retriever.py
import math
import datetime as dt
from typing import List, Dict, Any, Optional

class RAGRetriever:
    """
    Context-Aware Retriever:
      - Calls underlying semantic memory search (already implemented)
      - Ranks results by combined score: relevance (similarity) + recency + metadata weight
      - Optionally summarizes top results using a passed GPTResponder instance
    """

    def __init__(self, semantic_memory, gpt_responder=None, decay_days: float = 30.0, weights: Optional[Dict[str, float]] = None):
        """
        semantic_memory: instance of memory.semantic_memory.SemanticMemory
        gpt_responder: instance of nlp.gpt_response.GPTResponder (optional) for summarization
        decay_days: recency decay constant (bigger => slower decay)
        weights: dict with 'rel','rec','meta' keys to weight components (sum not required)
        """
        self.semantic = semantic_memory
        self.gpt = gpt_responder
        self.decay_days = float(decay_days)
        self.weights = weights or {"rel": 0.6, "rec": 0.3, "meta": 0.1}

        # emotion weighting map (tweak as needed)
        self.emotion_weights = {
            "sad": 1.15,
            "angry": 1.1,
            "anxious": 1.1,
            "happy": 0.9,
            "neutral": 1.0,
            "": 1.0
        }

        # source weighting
        self.source_weights = {"user": 1.2, "assistant": 1.0, "system": 1.0}

    def _recency_score(self, ts_iso: str) -> float:
        if not ts_iso:
            return 0.0
        try:
            # handle trailing Z
            ts_clean = ts_iso.rstrip("Z")
            t = dt.datetime.fromisoformat(ts_clean)
            now = dt.datetime.utcnow()
            delta_days = max(0.0, (now - t).total_seconds() / 86400.0)
            # exponential decay so very recent items ~1.0, older -> 0
            return math.exp(-delta_days / max(1.0, self.decay_days))
        except Exception:
            return 0.0

    def _meta_factor(self, metadata: dict) -> float:
        if not metadata:
            return 1.0
        emotion = (metadata.get("emotion") or "").lower()
        src = (metadata.get("source") or "").lower()
        e_w = self.emotion_weights.get(emotion, 1.0)
        s_w = self.source_weights.get(src, 1.0)
        return e_w * s_w

    def retrieve_and_rank(self, query: str, top_k: int = 8, min_similarity: float = 0.2) -> List[Dict[str, Any]]:
        """
        Returns results sorted by 'score' (descending).
        Each result: {"text":..., "similarity":..., "metadata":..., "score":...}
        """
        raw = []
        try:
            raw = self.semantic.search(query, top_k=top_k, min_similarity=min_similarity)
        except Exception as e:
            # semantic memory may fail; return empty
            print(f"[RAGRetriever] semantic.search error: {e}")
            return []

        scored = []
        for r in raw:
            sim = float(r.get("similarity", 0.0))
            meta = r.get("metadata") or {}
            rec = self._recency_score(meta.get("timestamp", ""))
            meta_factor = self._meta_factor(meta)

            # weighted sum
            score = (self.weights["rel"] * sim) + (self.weights["rec"] * rec) + (self.weights["meta"] * meta_factor)
            scored.append({**r, "score": score, "recency": rec, "meta_factor": meta_factor})

        # sort descending by combined score
        scored.sort(key=lambda x: x.get("score", 0.0), reverse=True)
        return scored

    def build_context(self, query: str, top_k: int = 6, min_similarity: float = 0.2, summary_max_items: int = 6) -> str:
        """
        Retrieve + rank + (optionally) summarize top results into a compact context block.
        Returns a plain text block suitable for insertion into the LLM prompt.
        If a gpt_responder is provided, uses it to generate a concise summary of top results.
        """
        ranked = self.retrieve_and_rank(query, top_k=top_k, min_similarity=min_similarity)
        if not ranked:
            return ""

        # Prepare top items to show/summarize
        top_items = ranked[:summary_max_items]
        # If a GPT summarizer is available, prefer a concise LLM summary (safer and more expressive)
        if self.gpt:
            try:
                return self.gpt.summarize_memories(top_items)
            except Exception as e:
                print(f"[RAGRetriever] summarization failed: {e}")
                # fallback to simple context block below

        # Fallback: build an extractive block
        lines = []
        for r in top_items:
            meta = r.get("metadata") or {}
            ts = meta.get("timestamp", "")
            src = meta.get("source", "")
            intent = meta.get("intent", "")
            sim = r.get("similarity", 0.0)
            lines.append(f"- [{ts} | {src} | {intent} | sim={sim:.2f}] {r.get('text')}")
        return "\n".join(lines)
