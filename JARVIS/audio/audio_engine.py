# audio/audio_engine.py
"""
Audio engine for JARVIS — Multi-model transcription pipeline.

Functions:
  record_audio()              — Microphone capture (console/desktop mode only).
  transcribe_audio()          — Default Whisper-base transcription (backward compat).
  transcribe_whisper_basic()  — Whisper base, English-locked, fast.
  transcribe_multilingual()   — Whisper medium, language auto-detect, translates.
  extract_scene_features()    — Librosa-based acoustic features for scene hinting.
"""

import os
import warnings

warnings.filterwarnings("ignore", category=UserWarning, module="whisper")
warnings.filterwarnings("ignore", category=FutureWarning)

# ── ffmpeg PATH injection ──────────────────────────────────────────────────────
_ffmpeg_dir = os.getenv(
    "FFMPEG_PATH",
    r"C:\ffmpeg\ffmpeg-8.1-essentials_build\bin",
)
if os.path.isdir(_ffmpeg_dir):
    os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")


# ── Whisper model cache (lazy singletons) ──────────────────────────────────────
_whisper_base_model = None
_whisper_medium_model = None


def _get_whisper_base():
    global _whisper_base_model
    if _whisper_base_model is None:
        import whisper
        print("Loading Whisper base model...")
        _whisper_base_model = whisper.load_model("base")
    return _whisper_base_model


def _get_whisper_medium():
    global _whisper_medium_model
    if _whisper_medium_model is None:
        import whisper
        print("Loading Whisper medium model (multilingual)...")
        _whisper_medium_model = whisper.load_model("medium")
    return _whisper_medium_model


# ── Microphone recording (console/desktop mode only) ──────────────────────────

def record_audio(filename: str = "cache/input.wav", duration: int = 5, fs: int = 44100) -> None:
    """Record audio from the default microphone."""
    import numpy as np
    import scipy.io.wavfile
    import sounddevice as sd

    os.makedirs(os.path.dirname(filename) if os.path.dirname(filename) else ".", exist_ok=True)
    print("🎤 Recording...")
    audio = sd.rec(int(duration * fs), samplerate=fs, channels=1, dtype="int16")
    sd.wait()
    scipy.io.wavfile.write(filename, fs, audio)
    print("✅ Done recording.")


# ── Transcription functions ────────────────────────────────────────────────────

def transcribe_audio(filename: str = "cache/input.wav") -> str:
    """
    Default transcription (backward compat) — Whisper base, English.
    Called by older code paths.
    """
    return transcribe_whisper_basic(filename)


def transcribe_whisper_basic(filename: str = "cache/input.wav") -> str:
    """
    Whisper Basic (Fast): base model, English-locked.
    Optimised for clear speech. Fast and lightweight.
    """
    model = _get_whisper_base()
    result = model.transcribe(
        filename,
        language="en",
        task="transcribe",
        fp16=False,
        condition_on_previous_text=False,
        temperature=0.0,            # greedy — most deterministic
        compression_ratio_threshold=2.4,
        logprob_threshold=-1.0,
        no_speech_threshold=0.6,
    )
    text: str = result["text"].strip()
    print(f"[Whisper Basic] Transcribed: {text[:120]}")
    return text


def transcribe_multilingual(filename: str = "cache/input.wav") -> dict:
    """
    Multilingual Voice: Whisper medium, auto-detects language, returns
    both transcription AND translation to English if the source is non-English.

    Returns:
        {
            "text": str,              # transcribed text (original language)
            "language": str,          # detected language code e.g. "es", "fr"
            "language_name": str,     # human readable e.g. "Spanish"
            "translation": str | None # English translation (None if already English)
        }
    """
    import whisper

    model = _get_whisper_medium()

    # Step 1: Auto-detect language
    audio = whisper.load_audio(filename)
    audio_clip = whisper.pad_or_trim(audio)
    mel = whisper.log_mel_spectrogram(audio_clip, n_mels=model.dims.n_mels).to(model.device)
    _, probs = model.detect_language(mel)
    detected_lang = max(probs, key=probs.get)

    # Map ISO code to readable name
    LANGUAGE_NAMES = {
        "en": "English", "es": "Spanish", "fr": "French", "de": "German",
        "it": "Italian", "pt": "Portuguese", "ru": "Russian", "zh": "Chinese",
        "ja": "Japanese", "ko": "Korean", "ar": "Arabic", "hi": "Hindi",
        "ta": "Tamil", "te": "Telugu", "ml": "Malayalam", "bn": "Bengali",
        "ur": "Urdu", "id": "Indonesian", "tr": "Turkish", "vi": "Vietnamese",
        "pl": "Polish", "nl": "Dutch", "sv": "Swedish", "no": "Norwegian",
    }
    lang_name = LANGUAGE_NAMES.get(detected_lang, detected_lang.upper())

    # Step 2: Transcribe in original language
    transcribe_result = model.transcribe(
        filename,
        language=detected_lang,
        task="transcribe",
        fp16=False,
        temperature=0.0,
        compression_ratio_threshold=2.4,
        no_speech_threshold=0.5,
    )
    original_text = transcribe_result["text"].strip()

    # Step 3: Translate to English if not already English
    translation = None
    if detected_lang != "en" and original_text:
        translate_result = model.transcribe(
            filename,
            language=detected_lang,
            task="translate",       # Whisper translate task → always outputs English
            fp16=False,
            temperature=0.0,
        )
        translation = translate_result["text"].strip()

    print(f"[Multilingual] Lang={lang_name} | Text: {original_text[:80]}")
    return {
        "text": original_text,
        "language": detected_lang,
        "language_name": lang_name,
        "translation": translation,
    }


# ── Acoustic scene feature extraction (librosa-based, no GPU required) ────────

def extract_scene_features(filename: str) -> dict:
    """
    Extracts acoustic features from audio using librosa.
    Works without GPU or PANNs — uses signal processing heuristics.

    Returns a dict with:
        noise_level     : "low" | "medium" | "high"
        crowd_hint      : bool — high zero-crossing + spectral spread → crowd likely
        music_hint      : bool — harmonic content detected
        speech_dominant : bool — speech-range energy ratio
        energy_db       : float — mean RMS in dB
        duration_sec    : float
        sample_rate     : int
    """
    try:
        import librosa
        import numpy as np

        y, sr = librosa.load(filename, sr=None, mono=True, duration=60.0)
        duration = librosa.get_duration(y=y, sr=sr)

        # RMS energy → noise level
        rms = librosa.feature.rms(y=y)[0]
        mean_rms = float(np.mean(rms))
        energy_db = float(20 * np.log10(mean_rms + 1e-9))

        if mean_rms > 0.05:
            noise_level = "high"
        elif mean_rms > 0.015:
            noise_level = "medium"
        else:
            noise_level = "low"

        # Zero-crossing rate — high ZCR + high energy → crowd/noise
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        mean_zcr = float(np.mean(zcr))
        crowd_hint = mean_zcr > 0.12 and mean_rms > 0.02

        # Spectral contrast → harmonic/music detection
        contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        mean_contrast = float(np.mean(contrast))
        music_hint = mean_contrast > 20.0

        # Speech frequency energy ratio (300 Hz – 3400 Hz band)
        stft = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        speech_mask = (freqs >= 300) & (freqs <= 3400)
        speech_energy = float(np.mean(stft[speech_mask, :]))
        total_energy = float(np.mean(stft)) + 1e-9
        speech_ratio = speech_energy / total_energy
        speech_dominant = speech_ratio > 0.35

        return {
            "noise_level": noise_level,
            "crowd_hint": crowd_hint,
            "music_hint": music_hint,
            "speech_dominant": speech_dominant,
            "energy_db": round(energy_db, 2),
            "duration_sec": round(duration, 2),
            "sample_rate": sr,
        }

    except Exception as exc:
        print(f"[extract_scene_features] Error: {exc}")
        return {
            "noise_level": "unknown",
            "crowd_hint": False,
            "music_hint": False,
            "speech_dominant": True,
            "energy_db": -60.0,
            "duration_sec": 0.0,
            "sample_rate": 16000,
        }


if __name__ == "__main__":
    record_audio()
    print(transcribe_audio())
