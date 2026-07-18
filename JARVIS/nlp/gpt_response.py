# nlp/gpt_response.py
"""
GPT response generator and memory summarizer.
Uses Azure OpenAI gpt-5.4-mini (or whatever AZURE_OPENAI_DEPLOYMENT is set to).
"""

import json
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from nlp._azure_client import build_client, get_deployment

load_dotenv(override=True)


class GPTResponder:
    def __init__(self, memory):
        build_client()   # Validate config eagerly
        get_deployment()
        self.memory = memory  # JSON key-value short memory

    @property
    def client(self):
        """Always return a fresh (cached) client — picks up .env changes live."""
        return build_client()

    @property
    def deployment(self):
        return get_deployment()

    def _build_kv_memory_context(self) -> str:
        try:
            with open("memory.json", "r", encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            data = {}
        if not data:
            return "No explicit key-value facts stored."
        lines = [f"- {k}: {v}" for k, v in data.items()]
        return "\n".join(lines)

    def summarize_memories(self, memories: List[Dict[str, Any]], max_items: int = 6) -> str:
        """
        Use LLM to produce a concise timeline-aware summary of the supplied memories.
        """
        if not memories:
            return ""

        snippet_lines = []
        for m in memories[:max_items]:
            meta = m.get("metadata") or {}
            ts = meta.get("timestamp", "")
            src = meta.get("source", "")
            intent = meta.get("intent", "")
            sim = m.get("similarity", 0.0)
            text = (m.get("text") or "").replace("\n", " ").strip()
            snippet_lines.append(f"[{ts}] ({src}|{intent}|sim={sim:.2f}) {text}")

        prompt = (
            "You are a careful assistant that summarizes past user/assistant statements into a short factual timeline.\n"
            "Take the following memory snippets (already sorted roughly by relevance).\n"
            "Task:\n"
            "1) Order them by timestamp (oldest -> newest).\n"
            "2) Produce 2-4 concise bullet points that capture: facts, changes, and contradictions. "
            "If a preference changed (A then not-A), say so clearly and indicate the later value as the current.\n"
            "3) Be strictly factual. DO NOT invent any new facts or explanations. If unsure, say 'I don't have details'.\n\n"
            "Memories:\n" + "\n".join(snippet_lines) + "\n\n"
            "Output: 2-4 bullet points, timeline-aware, short sentences."
        )

        try:
            resp = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": "You are a strict factual summarizer."},
                    {"role": "user", "content": prompt},
                ],
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            print(f"[GPTResponder.summarize_memories failed]: {e}")
            # Fallback: simple extractive block
            try:
                def ts_key(x):
                    try:
                        return x.get("metadata", {}).get("timestamp", "")
                    except Exception:
                        return ""
                sorted_mem = sorted(memories[:max_items], key=ts_key)
                return "\n".join(
                    f"- [{m.get('metadata', {}).get('timestamp', '')}] {m.get('text')}"
                    for m in sorted_mem
                )
            except Exception:
                return "\n".join(snippet_lines[:max_items])

    def generate_response(self, user_input: str, semantic_context: Optional[str] = None) -> str:
        kv_context = self._build_kv_memory_context()
        sem_block = semantic_context.strip() if semantic_context else ""

        system_msg = (
            "You are JARVIS, a warm, concise, and helpful personal AI assistant. "
            "You have two memory sources: (1) explicit key-value facts, and (2) retrieved conversational memories. "
            "Use them to stay consistent with the user's history. "
            "Be kind, precise, and avoid sounding robotic. "
            "If a memory doesn't exist, be honest and move on helpfully."
        )

        user_prompt = f"""
<memories>
  <explicit_kv>
{kv_context}
  </explicit_kv>
  <retrieved_semantic>
{sem_block if sem_block else "None"}
  </retrieved_semantic>
</memories>

User said: "{user_input}"

Instructions:
- If the user's question is answered by the retrieved memory, use it directly.
- If not, answer naturally with your own knowledge (but do not invent personal facts).
- Keep replies friendly and to-the-point.
"""

        try:
            resp = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            print("[GPT response failed]:", e)
            return "I'm having trouble generating a response right now."
