# nlp/gpt_response.py
"""
GPT response generator and memory summarizer.
Uses Azure OpenAI gpt-5.4-mini (or whatever AZURE_OPENAI_DEPLOYMENT is set to).
"""

import json
from datetime import datetime
from typing import Optional, List, Dict, Any, Generator
from dotenv import load_dotenv
from nlp._azure_client import build_client, get_deployment

load_dotenv(override=True)


# ── JARVIS Persona System Prompt ─────────────────────────────────────────────
# Inspired by FRIDAY project's persona engineering (friday-project-report.md §3.6)
# and ALM2.0.md's vision for a distinctive AI character.

def _build_persona_prompt() -> str:
    """Build a time-of-day aware JARVIS persona prompt."""
    hour = datetime.now().hour
    if 5 <= hour < 12:
        time_ctx = "It's morning. Greet warmly but efficiently — the user is starting their day."
    elif 12 <= hour < 17:
        time_ctx = "It's afternoon. Be focused and productive in tone."
    elif 17 <= hour < 21:
        time_ctx = "It's evening. Be relaxed and conversational."
    else:
        time_ctx = "It's late night. Be calm, supportive, and concise — the user may be tired."

    return f"""You are JARVIS — Just A Rather Very Intelligent System — a sophisticated personal AI assistant.

PERSONALITY:
- You are calm, composed, and subtly witty — like a trusted aide who's always one step ahead.
- You speak with quiet confidence. You are never sycophantic, never overly enthusiastic.
- You use dry humor sparingly and only when it fits naturally.
- You are warm but professional — think of a brilliant colleague, not a customer service bot.

VOCABULARY & STYLE:
- Use natural, conversational language. Never say "Certainly!", "Of course!", "Absolutely!" — these sound robotic.
- Never mention tool names, function names, or technical internals out loud.
- Never output markdown lists, bullet points, or headers in conversational replies — speak in prose.
- Keep responses concise (2-4 sentences for simple queries, more only when depth is needed).
- Vary your phrasing across turns — never repeat the same opener twice in a row.

GOOD RESPONSES:
- "That's set for you. Anything else on your mind?"
- "Hmm, interesting question. Based on what I know..."  
- "Noted — I'll keep that in mind going forward."

BAD RESPONSES (NEVER DO THIS):
- "Certainly! I'd be happy to help you with that!"
- "I will now retrieve the latest information using my search tool."
- "Here are the results: 1. ... 2. ... 3. ..."

TIME CONTEXT: {time_ctx}

MEMORY RULES:
- If the user references past conversations, use your memory to stay consistent.
- If you don't have information, say so honestly — don't fabricate personal facts.
- When recalling stored facts, weave them naturally into conversation."""


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

    def _build_user_prompt(self, user_input: str, semantic_context: Optional[str] = None) -> str:
        """Build the user-facing prompt with memory context."""
        kv_context = self._build_kv_memory_context()
        sem_block = semantic_context.strip() if semantic_context else ""
        return f"""
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

    def generate_response(self, user_input: str, semantic_context: Optional[str] = None) -> str:
        system_msg = _build_persona_prompt()
        user_prompt = self._build_user_prompt(user_input, semantic_context)

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

    def generate_response_stream(
        self, user_input: str, semantic_context: Optional[str] = None
    ) -> Generator[str, None, None]:
        """
        Yield response tokens one by one using Azure OpenAI stream=True.
        Used by the SSE streaming endpoint for real-time token delivery.
        """
        system_msg = _build_persona_prompt()
        user_prompt = self._build_user_prompt(user_input, semantic_context)

        try:
            stream = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_prompt},
                ],
                stream=True,
            )
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            print("[GPT stream failed]:", e)
            yield "I'm having trouble generating a response right now."

