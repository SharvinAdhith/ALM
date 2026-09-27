# nlp/nlp_engine.py
"""
NLP intent classifier and memory key extractor.
Uses Azure OpenAI gpt-5.4-mini (or whatever AZURE_OPENAI_DEPLOYMENT is set to).
"""

import json
from dotenv import load_dotenv
from nlp._azure_client import build_client, get_deployment

load_dotenv(override=True)


class NLPEngine:
    def __init__(self):
        # Validate config eagerly so bad .env fails loudly at startup
        build_client()
        get_deployment()

    @property
    def _client(self):
        """Always return a fresh (cached) client so .env changes are picked up."""
        return build_client()

    @property
    def _deployment(self):
        return get_deployment()

    def parse(self, text):
        """Classify the user's intent. Returns a list of ranked intents."""
        system_prompt = (
            "You are an intent classifier. Return a JSON array of the INTENTS that apply to the user input, "
            "in ranked order (most relevant first). Possible intents: remember, recall, forget, greeting, shutdown, emotion.\n\n"
            "Important rules:\n"
            " - If the user expresses a preference, liking, loving, preference change, or states a stable fact about themselves "
            "   (examples: 'I like coffee', 'I love pizza', 'My favorite color is blue', 'I am studying at SKCEP'), include 'remember' as a top intent.\n"
            " - If the user explicitly asks for recall ('What is my favorite drink?') include 'recall'.\n"
            " - If the user uses explicit deletion words ('forget', 'delete', 'remove') include 'forget'.\n"
            " - If the user greets ('hey', 'hello') include 'greeting'. If the user both greets and states something, include both, but prefer content intents like 'remember' or 'emotion' first.\n"
            " - If the user expresses feelings or mood (e.g., 'I am sad', 'I feel happy', 'I really like this') include 'emotion'.\n"
            " - If the user explicitly asks to stop, quit, exit, or shut down, use 'shutdown'. DO NOT use 'shutdown' for confirming actions like 'yes' or 'no'.\n"
            " - If none of the above fit (e.g. asking a random question, requesting an action, confirming), just output [\"unknown\"].\n"
            " - Respond ONLY with a JSON array of intents, e.g. [\"remember\", \"greeting\", \"emotion\"]. No extra text.\n\n"
            "Examples:\n"
            "User: 'Hey Jarvis' -> [\"greeting\"]\n"
            "User: 'Hey Jarvis, I really like coffee' -> [\"remember\", \"greeting\", \"emotion\"]\n"
            "User: 'I like cappuccino' -> [\"remember\", \"emotion\"]\n"
            "User: 'What's my favorite drink?' -> [\"recall\"]\n"
            "User: 'Actually, forget my favorite drink' -> [\"forget\"]\n"
            "User: 'I'm feeling sad today' -> [\"emotion\"]\n"
            "User: 'Yes, I said open YouTube' -> [\"unknown\"]\n"
            "User: 'Exit, goodbye' -> [\"shutdown\"]\n\n"
            "Now classify the following user message."
        )

        labels = ["remember", "recall", "forget", "greeting", "shutdown", "emotion"]
        user_prompt = f"User: {text}\nIntents:"

        try:
            response = self._client.chat.completions.create(
                model=self._deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            result = response.choices[0].message.content.strip()

            if result.startswith("```"):
                result = result.split("```", 1)[-1].strip().strip("```").strip()

            try:
                intents = json.loads(result)
            except json.JSONDecodeError:
                cleaned = result.strip().strip("`'\"")
                try:
                    intents = json.loads(cleaned)
                except Exception:
                    tokens = [t.strip(' "[]') for t in cleaned.replace('\n', ' ').split(',') if t.strip()]
                    intents = [t for t in tokens if t in labels]
                    if not intents:
                        print(f"[Invalid intent response]: {result}")
                        return ["unknown"], text

            if not isinstance(intents, list):
                print(f"[Invalid intent response type]: {result}")
                return ["unknown"], text

            intents = [i for i in intents if i in labels]
            if not intents:
                return ["unknown"], text

            return intents, text

        except Exception as e:
            print(f"[Intent classification failed]: {e}")
            return ["unknown"], text

    def extract_memory_key_value(self, text):
        """Extract key-value pair from memory statement."""
        system_prompt = "You extract structured memory from user sentences in JSON format."
        user_prompt = (
            "Extract the key and value from this sentence meant for memory storage.\n"
            'Respond with JSON like: {"key": "favorite color", "value": "blue"}\n\n'
            f"User: {text}\nOutput:"
        )

        try:
            response = self._client.chat.completions.create(
                model=self._deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )

            result = response.choices[0].message.content.strip()
            if result.startswith("```json"):
                result = result.strip("```json").strip("```").strip()

            data = json.loads(result)
            key = data.get("key")
            value = data.get("value")

            if key and value:
                return key.strip(), value.strip()
            else:
                print("[Memory extraction failed]: Key or value missing.")
                return None, None

        except json.JSONDecodeError:
            print("[Memory extraction failed]: Invalid JSON from model.")
            return None, None
        except Exception as e:
            print(f"[Memory extraction failed]: {e}")
            return None, None

    def extract_recall_key(self, text):
        """Extract just the key user is trying to recall."""
        system_prompt = "You extract recall keys from user questions. Return only the key string."
        user_prompt = (
            "Extract the memory key the user is trying to recall from the sentence.\n"
            "Example: User: What is my favorite color? Output: favorite color\n\n"
            f"User: {text}\nOutput:"
        )

        try:
            response = self._client.chat.completions.create(
                model=self._deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"[Recall key extraction failed]: {e}")
            return None

    def extract_emotion(self, text):
        """Extract a single word representing the emotion in the text."""
        system_prompt = "Analyze the text and return a single lowercase word representing the primary emotion (e.g., happy, sad, angry, stressed, calm, neutral)."
        user_prompt = f"Text: {text}\nEmotion:"
        try:
            response = self._client.chat.completions.create(
                model=self._deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_completion_tokens=10,
                temperature=0,
            )
            return response.choices[0].message.content.strip().lower().strip("'`\".")
        except Exception as e:
            print(f"[Emotion extraction failed]: {e}")
            return "neutral"
