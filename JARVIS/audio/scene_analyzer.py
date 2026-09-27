# audio/scene_analyzer.py
"""
JARVIS Scene Analyzer — Unified audio scene analysis pipeline.

Dispatches to the correct analysis pipeline based on `audio_model`:

  "whisper-basic"    → Quick English speech transcript + basic scene hints
  "alm-full-scene"   → Full BAP scene analysis (PANNs + librosa + emotion)
  "whisper-multi"    → Multilingual transcription with language detection

Each returns a structured SceneResult dict used to build the JARVIS GPT prompt.
"""

from __future__ import annotations
import logging
from typing import Any

logger = logging.getLogger(__name__)


def analyze_audio_scene(file_path: str, audio_model: str = "whisper-basic") -> dict[str, Any]:
    """
    Master entry point — runs the right pipeline for the selected model.

    Returns a SceneResult dict:
        {
            "model":          str,
            "transcription":  str,
            "language":       str | None,
            "language_name":  str | None,
            "translation":    str | None,
            "scene_type":     str | None,
            "noise_level":    str | None,   "low" | "medium" | "high"
            "crowd_detected": bool | None,
            "events":         list[dict],   PANNs structured events
            "events_summary": str,          Human-readable event listing
            "emotion":        str | None,
            "confidence":     float | None,
            "jarvis_prompt":  str,          Full prompt to send to JARVIS brain
        }
    """
    import os
    from audio.audio_engine import ensure_wav_file

    wav_path = ensure_wav_file(file_path)
    try:
        if audio_model == "alm-full-scene":
            return _analyze_bap(wav_path)
        elif audio_model == "whisper-multi":
            return _analyze_multilingual(wav_path)
        else:
            return _analyze_whisper_basic(wav_path)
    finally:
        if wav_path != file_path and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except OSError:
                pass


# ── Model 1: Whisper Basic ─────────────────────────────────────────────────────

def _analyze_whisper_basic(file_path: str) -> dict:
    """Fast English transcription + lightweight acoustic scene hints."""
    from audio.audio_engine import transcribe_whisper_basic, extract_scene_features

    transcription = transcribe_whisper_basic(file_path)
    features = extract_scene_features(file_path)

    noise_level = features.get("noise_level", "unknown")
    crowd_hint = features.get("crowd_hint", False)
    speech_dominant = features.get("speech_dominant", True)

    # Build a short scene hint for the prompt
    scene_hints = []
    if noise_level == "high":
        scene_hints.append("high background noise environment")
    if crowd_hint:
        scene_hints.append("possible crowd or multiple speakers")
    if not speech_dominant:
        scene_hints.append("significant non-speech audio content detected")

    scene_hint_str = "; ".join(scene_hints) if scene_hints else "clear audio"

    jarvis_prompt = _build_whisper_basic_prompt(transcription, scene_hint_str, features)

    return {
        "model": "whisper-basic",
        "transcription": transcription,
        "language": "en",
        "language_name": "English",
        "translation": None,
        "scene_type": None,
        "noise_level": noise_level,
        "crowd_detected": crowd_hint,
        "events": [],
        "events_summary": scene_hint_str,
        "emotion": None,
        "confidence": None,
        "jarvis_prompt": jarvis_prompt,
    }


def _build_whisper_basic_prompt(transcription: str, scene_hint: str, features: dict) -> str:
    duration = features.get("duration_sec", 0)
    energy = features.get("energy_db", -60)
    lines = []

    if transcription.strip():
        lines.append(f"The user spoke the following (transcribed from audio): \"{transcription}\"")
    else:
        lines.append("The user submitted an audio file, but no clear speech was detected.")

    lines.append(f"[Audio context: {scene_hint} | Duration: {duration:.1f}s | Level: {energy:.1f} dB]")
    lines.append("(System note: Do NOT ask the user to send audio again. Respond naturally to the content above.)")

    return "\n".join(lines)


# ── Model 2: BAP (Full Scene Analysis) ────────────────────────────────────────

def _analyze_bap(file_path: str) -> dict:
    """Full Background Audio Processing — PANNs + emotion + librosa."""
    from audio.audio_engine import transcribe_whisper_basic, extract_scene_features
    from audio.audio_classifier import classify_scene
    from audio.emotion_detector import detect_emotion

    # Run all analyses
    try:
        transcription = transcribe_whisper_basic(file_path)
    except Exception as e:
        logger.warning(f"BAP transcription failed: {e}")
        transcription = ""

    try:
        features = extract_scene_features(file_path)
    except Exception as e:
        logger.warning(f"BAP feature extraction failed: {e}")
        features = {}

    try:
        scene = classify_scene(file_path, scene_features=features)
    except Exception as e:
        logger.warning(f"BAP scene classification failed: {e}")
        scene = {"events": [], "top_categories": [], "scene_type": "Unknown", "noise_level": "medium", "crowd_detected": False}

    try:
        emotion = detect_emotion(file_path)
    except Exception as e:
        logger.warning(f"BAP emotion detection failed: {e}")
        emotion = "neutral"

    events = scene.get("events", [])
    scene_type = scene.get("scene_type", "General environment")
    noise_level = scene.get("noise_level", features.get("noise_level", "medium"))
    crowd_detected = scene.get("crowd_detected", features.get("crowd_hint", False))
    source = scene.get("source", "unknown")

    # Build human-readable event summary
    events_summary = _format_events_summary(events)

    jarvis_prompt = _build_bap_prompt(
        transcription, scene_type, noise_level, crowd_detected,
        events, events_summary, emotion, features, source
    )

    return {
        "model": "alm-full-scene",
        "transcription": transcription,
        "language": "en",
        "language_name": "English",
        "translation": None,
        "scene_type": scene_type,
        "noise_level": noise_level,
        "crowd_detected": crowd_detected,
        "events": events,
        "events_summary": events_summary,
        "emotion": emotion,
        "confidence": events[0]["confidence"] if events else None,
        "jarvis_prompt": jarvis_prompt,
    }


def _format_events_summary(events: list[dict]) -> str:
    if not events:
        return "No distinct sound events detected."
    parts = []
    for e in events[:8]:  # cap at 8 for readability
        parts.append(f"{e['display']} ({e['confidence']:.0%})")
    return ", ".join(parts)


def _build_bap_prompt(
    transcription: str, scene_type: str, noise_level: str,
    crowd_detected: bool, events: list[dict], events_summary: str,
    emotion: str, features: dict, source: str
) -> str:
    duration = features.get("duration_sec", 0)
    energy_db = features.get("energy_db", -60)
    music_hint = features.get("music_hint", False)

    lines = [
        "=== BAP Model — Background Audio Processing Analysis ===",
        "",
        f"🎙️ Speech transcription: \"{transcription}\"" if transcription.strip()
        else "🎙️ Speech transcription: [No clear speech detected — ambient/environmental audio]",
        "",
        f"🌍 Detected scene type: {scene_type}",
        f"🔊 Noise level: {noise_level.capitalize()}",
        f"👥 Crowd detected: {'Yes' if crowd_detected else 'No'}",
        f"😶 Voice emotion: {emotion.capitalize()}",
        f"⏱️ Audio duration: {duration:.1f}s",
        f"📊 Energy level: {energy_db:.1f} dB",
        ""
    ]

    if events:
        lines.append("🔍 Detected sound events:")
        for e in events[:8]:
            lines.append(f"   • {e['display']} — confidence {e['confidence']:.0%}")
    else:
        lines.append("🔍 No specific sound events detected above threshold.")

    if music_hint:
        lines.append("   🎵 Background music or harmonic content also detected.")

    lines += [
        "",
        f"🤖 Analysis engine: {source}",
        "",
        "=== JARVIS INSTRUCTION ===",
        "Based on the above audio scene analysis, provide a rich, detailed description of:",
        "1. What sounds are present in the scene and what they indicate.",
        "2. The overall environment and atmosphere.",
        "3. Any speech content, and what the speaker is saying.",
        "4. What a person physically present at this location would be experiencing.",
        "Do NOT ask for more audio. Do NOT say you cannot analyse audio. Respond as JARVIS with full confidence.",
    ]

    return "\n".join(lines)


# ── Model 3: Multilingual Voice ───────────────────────────────────────────────

def _analyze_multilingual(file_path: str) -> dict:
    """Whisper medium — auto language detection + translation."""
    from audio.audio_engine import transcribe_multilingual, extract_scene_features

    try:
        result = transcribe_multilingual(file_path)
    except Exception as e:
        logger.warning(f"Multilingual transcription failed: {e}")
        result = {"text": "", "language": "unknown", "language_name": "Unknown", "translation": None}

    try:
        features = extract_scene_features(file_path)
    except Exception as e:
        logger.warning(f"Multilingual feature extraction failed: {e}")
        features = {}

    transcription = result.get("text", "")
    language = result.get("language", "unknown")
    language_name = result.get("language_name", "Unknown")
    translation = result.get("translation")
    noise_level = features.get("noise_level", "medium")
    crowd_hint = features.get("crowd_hint", False)

    events_summary = "Acoustic hints: "
    hints = []
    if noise_level == "high":
        hints.append("high-noise environment")
    if crowd_hint:
        hints.append("crowd or chatter detected")
    events_summary += (", ".join(hints) if hints else "clean audio")

    jarvis_prompt = _build_multilingual_prompt(
        transcription, language, language_name, translation, features, events_summary
    )

    return {
        "model": "whisper-multi",
        "transcription": transcription,
        "language": language,
        "language_name": language_name,
        "translation": translation,
        "scene_type": None,
        "noise_level": noise_level,
        "crowd_detected": crowd_hint,
        "events": [],
        "events_summary": events_summary,
        "emotion": None,
        "confidence": None,
        "jarvis_prompt": jarvis_prompt,
    }


def _build_multilingual_prompt(
    transcription: str, language: str, language_name: str,
    translation: str | None, features: dict, events_summary: str
) -> str:
    duration = features.get("duration_sec", 0)

    lines = [
        "=== Multilingual Voice Model — Audio Analysis ===",
        "",
        f"🌐 Detected language: {language_name} (ISO code: {language})",
        f"⏱️ Audio duration: {duration:.1f}s",
        f"🔊 Audio environment: {events_summary}",
        "",
    ]

    if transcription.strip():
        lines.append(f"🎙️ Original transcription ({language_name}):")
        lines.append(f'   "{transcription}"')
    else:
        lines.append("🎙️ Transcription: [No clear speech detected]")

    if translation:
        lines += [
            "",
            f"🔤 English translation:",
            f'   "{translation}"',
        ]

    lines += [
        "",
        "=== JARVIS INSTRUCTION ===",
        f"The user submitted audio in {language_name}.",
        "1. Acknowledge the detected language naturally.",
        "2. If English: respond to the content directly.",
        "3. If non-English: mention you detected the language, show the translation, and respond to it.",
        "4. Be conversational and helpful. Do NOT say you cannot process audio.",
    ]

    return "\n".join(lines)
