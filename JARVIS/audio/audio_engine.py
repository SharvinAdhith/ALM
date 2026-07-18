# audio/audio_engine.py
"""
Audio engine for JARVIS.

record_audio()     — Microphone capture (console/desktop mode only).
                     Imports sounddevice + scipy lazily so the module can be
                     imported in headless/server environments without error.

transcribe_audio() — Whisper-based transcription. Works in both modes and is
                     called by the FastAPI backend for uploaded audio files.
"""

import os
import warnings

warnings.filterwarnings("ignore", category=UserWarning, module="whisper")

# ── ffmpeg PATH injection ──────────────────────────────────────────────────────
# Set FFMPEG_PATH in your .env to override. Falls back to a common Windows path.
_ffmpeg_dir = os.getenv(
    "FFMPEG_PATH",
    r"C:\ffmpeg\ffmpeg-8.1-essentials_build\bin",
)
if os.path.isdir(_ffmpeg_dir):
    os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")


def record_audio(filename: str = "cache/input.wav", duration: int = 5, fs: int = 44100) -> None:
    """
    Record audio from the default microphone.
    Console/desktop mode only — imports sounddevice + scipy lazily.
    """
    import numpy as np  # noqa: PLC0415
    import scipy.io.wavfile  # noqa: PLC0415
    import sounddevice as sd  # noqa: PLC0415

    os.makedirs(os.path.dirname(filename) if os.path.dirname(filename) else ".", exist_ok=True)
    print("🎤 Recording...")
    audio = sd.rec(int(duration * fs), samplerate=fs, channels=1, dtype="int16")
    sd.wait()
    scipy.io.wavfile.write(filename, fs, audio)
    print("✅ Done recording.")


def transcribe_audio(filename: str = "cache/input.wav") -> str:
    """
    Transcribe an audio file using OpenAI Whisper (base model).
    Works in both console and API/server mode.
    """
    import whisper  # noqa: PLC0415

    model = whisper.load_model("base")
    result = model.transcribe(filename, language="en")
    text: str = result["text"]
    print("🗣️ Transcribed:", text)
    return text


if __name__ == "__main__":
    record_audio()
    transcribe_audio()

