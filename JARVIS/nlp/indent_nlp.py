# nlp/indent_nlp.py
import time
import re
from .gpt_response import GPTResponder
from memory.semantic_memory import SemanticMemory
from memory.rag_retriever import RAGRetriever

NEGATION_PATTERNS = [
    r"\bi (do n't|don't|do not)\b",      # "I don't"
    r"\bno longer\b",
    r"\bnot anymore\b",
    r"\bnever liked\b",
    r"\bI (stopped|stopping)\b",
]

def looks_like_negation(text: str) -> bool:
    t = text.lower()
    for p in NEGATION_PATTERNS:
        if re.search(p, t):
            return True
    return False

class CoreBrain:
    def __init__(self, memory, speaker, nlp, semantic: SemanticMemory, gpt_responder: GPTResponder, rag_retriever: RAGRetriever, tool_router=None):
        self.memory = memory                # JSON key-value
        self.speaker = speaker
        self.nlp = nlp                      # intent + extractors
        self.gpt = gpt_responder            # injected GPT responder
        self.semantic = semantic            # semantic memory
        self.rag = rag_retriever            # injected RAG retriever
        self.tool_router = tool_router

    def _retrieve_context(self, query: str) -> str:
        try:
            return self.rag.build_context(query, top_k=6, min_similarity=0.25)
        except Exception as e:
            print(f"[CoreBrain._retrieve_context error]: {e}")
            return ""

    def _store_turns(self, user_text: str, assistant_text: str, intent: list, emotion: str = None):
        try:
            if user_text and len(user_text.strip()) > 3:
                self.semantic.add_memory(
                    user_text,
                    metadata={"source": "user", "intent": intent, "emotion": emotion or ""}
                )
        except Exception as e:
            print(f"[SemanticMemory store(user) failed]: {e}")
        try:
            if assistant_text and len(assistant_text.strip()) > 3 and intent != "shutdown":
                self.semantic.add_memory(
                    assistant_text,
                    metadata={"source": "assistant", "intent": intent, "emotion": ""}
                )
        except Exception as e:
            print(f"[SemanticMemory store(assistant) failed]: {e}")

    def _explicit_forget_intent(self, text: str) -> bool:
        """
        Decide if user truly meant to delete (explicit keywords).
        Return True if text contains direct deletion instructions like "forget X", "delete X".
        """
        t = text.lower()
        return any(kw in t for kw in ["forget", "delete", "remove", "clear this", "erase"])

    def route(self, intents, data):
        """
        Route the user utterance to the appropriate intent handler.

        Args:
            intents (list[str]): Ranked list of possible intents (from classifier).
            data (str): Raw user utterance.

        Flow:
            1. Resolve top-priority intent using priority_order.
            2. Retrieve semantic context (RAG).
            3. Handle special cases:
                - forget: explicit deletion OR implicit update/negation.
                - remember: store key-value or fallback to semantic memory.
                - recall: query KV store first, then semantic memory.
                - greeting/emotion: store in semantic memory and respond.
                - shutdown: exit gracefully.
            4. Unknown → fallback to GPT with semantic context.

        Side-effects:
            - Speaks response via self.speaker.
            - Stores user+assistant turns into memory.
        """
        emotion = "neutral"  # placeholder; wire actual emotion from NLP if available
        response = "I'm not sure what that means yet."

        try:
            # --- Intent resolution ---
            priority_order = ["forget", "remember", "recall", "emotion", "shutdown", "greeting", "unknown"]
            chosen = next((c for c in priority_order if c in intents), "unknown")

            # --- Context for GPT (retrieved via RAG) ---
            sem_context = self._retrieve_context(data)

            # === Forget / Update Intent ===
            if chosen == "forget":
                if self._explicit_forget_intent(data):
                    # Explicit deletion case
                    key = self.nlp.extract_recall_key(data)
                    if key:
                        self.memory.forget(key)
                        response = self.gpt.generate_response(
                            f"I've removed the stored detail for '{key}'. I'll no longer use it. Confirm kindly without using the words forget/delete/remove.",
                            semantic_context=sem_context
                        )
                    else:
                        response = self.gpt.generate_response(
                            f"It sounds like you want me to remove something, but I couldn't identify what. Which detail should I remove?",
                            semantic_context=sem_context
                        )
                else:
                    # Implicit update / negation (e.g., "I don't like coffee anymore")
                    key, value = self.nlp.extract_memory_key_value(data)
                    if key and value:
                        self.memory.remember(key, value)
                        response = self.gpt.generate_response(
                            f"Got it — I updated {key} to {value}. I'll keep the history, and use the latest as your current preference.",
                            semantic_context=sem_context
                        )
                    elif looks_like_negation(data):
                        # store raw negation in semantic memory
                        try:
                            self.semantic.add_memory(
                                data,
                                metadata={"source": "user", "intent": "update", "emotion": emotion}
                            )
                        except Exception as e:
                            print(f"[SemanticMemory add during negation failed]: {e}")

                        key_guess = self.nlp.extract_recall_key(data)
                        if key_guess:
                            self.memory.remember(key_guess, data)
                            response = self.gpt.generate_response(
                                f"Understood. I've noted the update for '{key_guess}'. I'll treat the latest as your current preference.",
                                semantic_context=sem_context
                            )
                        else:
                            response = self.gpt.generate_response(
                                "Thanks — I noted that change. I kept the past records too, so I can compare them when asked.",
                                semantic_context=sem_context
                            )
                    else:
                        response = self.gpt.generate_response(
                            "I heard that you want to change something. Could you say explicitly 'forget X' if you want me to remove it, or 'remember that X is Y' to update?",
                            semantic_context=sem_context
                        )

            # === Remember Intent ===
            elif chosen == "remember":
                key, value = self.nlp.extract_memory_key_value(data)
                if key and value:
                    self.memory.remember(key, value)
                    response = self.gpt.generate_response(
                        f"Please confirm you saved: {key} = {value}. Be warm and concise.",
                        semantic_context=sem_context
                    )
                else:
                    try:
                        self.semantic.add_memory(
                            data,
                            metadata={"source": "user", "intent": "remember", "emotion": emotion}
                        )
                    except Exception as e:
                        print(f"[Semantic memory store fallback failed]: {e}")
                    response = self.gpt.generate_response(
                        "Thanks — I've noted that.",
                        semantic_context=sem_context
                    )

            # === Recall Intent ===
            elif chosen == "recall":
                key = self.nlp.extract_recall_key(data)
                if not key:
                    response = self.gpt.generate_response(
                        f"The user asked: '{data}'. If the retrieved memories answer it, use them. If not, be honest and ask for clarification.",
                        semantic_context=sem_context
                    )
                else:
                    value = self.memory.recall(key)
                    if value == "I don't remember that yet.":
                        response = self.gpt.generate_response(
                            f"The user asked: '{data}'. Use retrieved memories if they answer it; otherwise be honest that you don't have a stored fact.",
                            semantic_context=sem_context
                        )
                    else:
                        response = self.gpt.generate_response(
                            f"The user asked: '{data}'. Explicit KV memory says: {key} = {value}. Answer naturally using that fact.",
                            semantic_context=sem_context
                        )

            # === Greeting ===
            elif chosen == "greeting":
                response = self.gpt.generate_response(
                    "The user greeted me. Respond politely, friendly, and keep it short.",
                    semantic_context=sem_context
                )

            # === Emotion ===
            elif chosen == "emotion":
                try:
                    self.semantic.add_memory(
                        data,
                        metadata={"source": "user", "intent": "emotion", "emotion": emotion}
                    )
                except Exception as e:
                    print(f"[SemanticMemory store(emotion) failed]: {e}")
                response = self.gpt.generate_response(
                    f"The user expressed feelings: '{data}'. Respond empathically and supportive, keep it brief.",
                    semantic_context=sem_context
                )

            # === Shutdown ===
            elif chosen == "shutdown":
                self.speaker.speak("Shutting down. Goodbye.")
                time.sleep(1.5)  # Let TTS finish
                exit(0)

            # === Unknown Intent (fallback) ===
            else:
                # Fallback to tool router (preferred) else GPT
                print("🧠 [Fallback] No matching intent. Trying tool router first.")
                if self.tool_router:
                    # tool_router handles LLM planning + tool calls + final response
                    response = self.tool_router.plan_and_execute(data, sem_context)
                else:
                    response = self.gpt.generate_response(data, semantic_context=sem_context)

        except Exception as e:
            print(f"[CoreBrain Error]: {e}")
            response = "Something went wrong while thinking that through."

        # --- Persist + Speak ---
        self.speaker.speak(response)
        self._store_turns(user_text=data, assistant_text=response, intent=chosen, emotion=emotion)
        return response, emotion
