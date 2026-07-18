import os
import time
import logging
from os import environ
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class SilentSpeechEngine:
    """
    No-op speech engine for API / server mode.

    When JARVIS serves web clients (FastAPI backend), the browser handles
    text-to-speech via the Web Speech API. This engine suppresses all Azure
    TTS calls and pygame audio playback on the server machine, preventing
    unnecessary API billing, file I/O, and blocking audio output.

    Drop-in replacement for SpeechEngine — same interface.
    """

    def speak(self, text: str) -> None:
        """Log the response text only; do not synthesize or play audio."""
        logger.info("[SilentSpeechEngine] (TTS suppressed in API mode): %s", text)


class SpeechEngine:
    """
    Full Azure TTS + pygame speech engine for console / desktop mode.
    Used exclusively by main.py (voice REPL). NOT used by the FastAPI backend.
    """

    def __init__(self):
        environ["PYGAME_HIDE_SUPPORT_PROMPT"] = "1"
        import pygame  # lazy import: only needed in console mode
        self._pygame = pygame

        self.subscription_key = os.getenv("AZURE_SPEECH_KEY")
        self.region = os.getenv("AZURE_REGION")
        if not self.subscription_key or not self.region:
            raise ValueError(
                "Azure Speech credentials missing. "
                "Set AZURE_SPEECH_KEY and AZURE_REGION in JARVIS/.env"
            )
        self.endpoint = (
            f"https://{self.region}.tts.speech.microsoft.com/cognitiveservices/v1"
        )
        self.voice = "en-US-JennyNeural"
        # Use OS-agnostic path separator
        os.makedirs("cache", exist_ok=True)
        self.output_file = os.path.join("cache", "jarvis_output.mp3")

    def speak(self, text: str) -> None:
        import requests  # lazy import: only needed in console mode

        print(f"🗣️ JARVIS says: {text}")

        headers = {
            "Ocp-Apim-Subscription-Key": self.subscription_key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
            "User-Agent": "JARVIS-TTS",
        }

        ssml = (
            f"<speak version='1.0' xml:lang='en-US'>"
            f"<voice xml:lang='en-US' name='{self.voice}'>{text}</voice>"
            f"</speak>"
        )

        try:
            response = requests.post(
                self.endpoint, headers=headers, data=ssml.encode("utf-8")
            )

            if response.status_code == 200:
                with open(self.output_file, "wb") as audio_file:
                    audio_file.write(response.content)

                pygame = self._pygame
                pygame.mixer.init()
                pygame.mixer.music.load(self.output_file)
                pygame.mixer.music.play()

                while pygame.mixer.music.get_busy():
                    time.sleep(0.1)

                pygame.mixer.music.stop()
                pygame.mixer.quit()  # Release file handle before deletion

                try:
                    os.remove(self.output_file)
                except OSError:
                    pass  # Non-critical

            else:
                logger.error(
                    "TTS HTTP error %s: %s", response.status_code, response.text
                )

        except Exception as exc:
            logger.exception("TTS exception: %s", exc)