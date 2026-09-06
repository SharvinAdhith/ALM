# audio/audio_classifier.py
"""
Audio classifier for JARVIS — BAP Model (Background Audio Processing Model).

Uses PANNs (Pre-trained Audio Neural Networks) for high-accuracy tagging of
500+ audio classes. Falls back to a librosa-based heuristic classifier when
PANNs / torch is unavailable.

Public API:
    detect_background_events(file_path)  → list[str]  (legacy compat)
    classify_scene(file_path)            → dict        (full structured analysis)
"""

import numpy as np
from typing import Optional

# ── PANNs singleton ────────────────────────────────────────────────────────────
_panns_model = None


def _get_panns_model():
    global _panns_model
    if _panns_model is None:
        try:
            import torch
            from panns_inference import AudioTagging
            print("[BAP] Lazy-loading PANNs AudioTagging model...")
            device = "cuda" if torch.cuda.is_available() else "cpu"
            _panns_model = AudioTagging(checkpoint_path=None, device=device)
            print(f"[BAP] PANNs loaded on {device}.")
        except ImportError:
            print("[BAP] panns_inference/torch not available — using librosa fallback.")
            _panns_model = "FALLBACK"
    return _panns_model


# ── Semantic scene label grouping ─────────────────────────────────────────────
#
# Maps PANNs class names (lowercase) to our semantic scene categories.
# Covers airport-relevant sounds, plus common environmental scenarios.

_LABEL_TO_CATEGORY = {
    # Aircraft / Airport
    "aircraft": "Aircraft",
    "airplane": "Aircraft",
    "jet engine": "Aircraft",
    "propeller, airscrew": "Aircraft",
    "helicopter": "Aircraft",
    "fixed-wing aircraft, airplane": "Aircraft",
    "engine": "Engine noise",
    "engine, motor": "Engine noise",

    # Public announcements
    "public address system": "PA / Announcement",
    "speech synthesizer": "PA / Announcement",
    "loudspeaker": "PA / Announcement",
    "public address system, p.a. system": "PA / Announcement",

    # People / Crowd
    "speech": "Human Speech",
    "male speech, man speaking": "Human Speech",
    "female speech, woman speaking": "Human Speech",
    "child speech, kid speaking": "Human Speech",
    "conversation": "Human Speech",
    "narration, monologue": "Human Speech",
    "crowd": "Crowd Noise",
    "hubbub, babble": "Crowd Noise",
    "chatter": "Crowd Noise",
    "babbling": "Crowd Noise",
    "laughter": "Laughter",
    "giggling": "Laughter",
    "crying, sobbing": "Crying",
    "cough": "Human Sounds",
    "sneeze": "Human Sounds",
    "breathing": "Human Sounds",
    "whispering": "Human Sounds",
    "shout": "Human Sounds",

    # Transport / Vehicles
    "car": "Vehicle",
    "vehicle": "Vehicle",
    "bus": "Vehicle",
    "truck": "Vehicle",
    "train": "Train",
    "rail transport": "Train",
    "subway, metro, underground": "Train",
    "traffic noise, roadway noise": "Traffic",
    "horn": "Vehicle Horn",
    "beep, bleep": "Alert / Beep",
    "car alarm": "Alert / Beep",
    "siren": "Siren",
    "emergency vehicle": "Siren",

    # Terminal / Indoor ambient
    "air conditioning": "HVAC / Air",
    "mechanical fan": "HVAC / Air",
    "white noise": "Ambient Noise",
    "noise": "Ambient Noise",
    "pink noise": "Ambient Noise",
    "hiss": "Ambient Noise",
    "hum": "Ambient Noise",
    "rumble": "Low-frequency rumble",
    "thump, thud": "Impact",
    "bang": "Impact",

    # Footsteps
    "walk, footsteps": "Footsteps",
    "run": "Footsteps",

    # Luggage / Objects
    "zipper (clothing)": "Luggage handling",
    "clicking": "Luggage handling",
    "ratchet, pawl": "Luggage handling",
    "door": "Door",
    "squeak": "Door",
    "slam": "Door",
    "knock": "Door",

    # Music in background
    "music": "Background Music",
    "musical instrument": "Background Music",
    "pop music": "Background Music",
    "electronic music": "Background Music",
    "background music": "Background Music",

    # Rain / Weather
    "rain": "Weather",
    "wind": "Weather",
    "thunder": "Weather",
}

# Inverse: category → display label
_CATEGORY_DISPLAY = {
    "Aircraft": "✈️ Aircraft / Jet engine",
    "Engine noise": "🔧 Engine noise",
    "PA / Announcement": "📢 PA Announcement",
    "Human Speech": "🗣️ Human speech",
    "Crowd Noise": "👥 Crowd noise",
    "Laughter": "😄 Laughter",
    "Crying": "😢 Crying",
    "Human Sounds": "🫁 Human sounds",
    "Vehicle": "🚗 Vehicle",
    "Train": "🚆 Train",
    "Traffic": "🚦 Traffic",
    "Vehicle Horn": "📯 Horn",
    "Alert / Beep": "🔔 Alert / Beep",
    "Siren": "🚨 Siren",
    "HVAC / Air": "💨 HVAC / Air",
    "Ambient Noise": "〰️ Ambient noise",
    "Low-frequency rumble": "〽️ Low-frequency rumble",
    "Impact": "💥 Impact sound",
    "Footsteps": "👣 Footsteps",
    "Luggage handling": "🧳 Luggage handling",
    "Door": "🚪 Door",
    "Background Music": "🎵 Background music",
    "Weather": "🌧️ Weather",
}

# ── Scene type classifier from event categories ────────────────────────────────

def _infer_scene_type(categories: list[str], noise_level: str, crowd_detected: bool) -> str:
    """Heuristically infer the scene type from detected event categories."""
    cats = set(categories)

    if "Aircraft" in cats:
        return "Airport / Airfield"
    if "Train" in cats and ("Crowd Noise" in cats or crowd_detected):
        return "Train station"
    if "Traffic" in cats and noise_level == "high":
        return "Busy street / Road"
    if "PA / Announcement" in cats and crowd_detected:
        return "Public venue / Terminal"
    if crowd_detected and noise_level in ("medium", "high"):
        return "Crowd / Public space"
    if "HVAC / Air" in cats and "Human Speech" in cats:
        return "Indoor office / Building"
    if "Background Music" in cats and "Human Speech" in cats:
        return "Restaurant / Café"
    if "Weather" in cats:
        return "Outdoor / Nature"
    if noise_level == "low" and "Human Speech" in cats:
        return "Quiet indoor"
    return "General environment"


# ── PANNs-based classification ─────────────────────────────────────────────────

def _classify_with_panns(file_path: str) -> dict:
    """Run PANNs inference and return structured result."""
    try:
        import librosa
        from panns_inference import labels as panns_labels

        model = _get_panns_model()
        if model == "FALLBACK":
            return _classify_with_librosa(file_path)

        # Load at 32kHz as required by PANNs
        audio, _ = librosa.core.load(file_path, sr=32000, mono=True)
        audio = audio[None, :]  # shape (1, samples)

        (clipwise_output, _embedding) = model.inference(audio)
        scores = clipwise_output[0]

        # Get top-10 events above threshold 0.05
        sorted_idx = np.argsort(scores)[::-1]
        top_events_raw = []
        for idx in sorted_idx[:15]:
            score = float(scores[idx])
            if score >= 0.05:
                label = panns_labels[idx]
                top_events_raw.append((label, score))
            if len(top_events_raw) >= 10:
                break

        # Map to semantic categories (deduplicate by category)
        seen_categories = {}
        for label, score in top_events_raw:
            label_lower = label.lower()
            category = None
            for key, cat in _LABEL_TO_CATEGORY.items():
                if key in label_lower or label_lower in key:
                    category = cat
                    break
            if category is None:
                category = label  # keep raw label if no mapping

            # Keep highest-scoring event per category
            if category not in seen_categories or score > seen_categories[category][1]:
                seen_categories[category] = (label, score)

        # Build structured event list
        structured_events = []
        for category, (raw_label, score) in sorted(seen_categories.items(), key=lambda x: -x[1][1]):
            display = _CATEGORY_DISPLAY.get(category, category)
            structured_events.append({
                "category": category,
                "display": display,
                "raw_label": raw_label,
                "confidence": round(score, 3),
            })

        return {
            "source": "PANNs",
            "events": structured_events,
            "top_categories": [e["category"] for e in structured_events],
        }

    except Exception as exc:
        print(f"[BAP PANNs] Error: {exc} — falling back to librosa.")
        return _classify_with_librosa(file_path)


# ── Librosa-based fallback classifier ─────────────────────────────────────────

def _classify_with_librosa(file_path: str) -> dict:
    """
    Heuristic scene classification using librosa spectral features.
    No GPU or PANNs required. Provides a best-guess scene analysis.
    """
    try:
        import librosa

        y, sr = librosa.load(file_path, sr=None, mono=True, duration=60.0)

        rms = librosa.feature.rms(y=y)[0]
        mean_rms = float(np.mean(rms))

        zcr = librosa.feature.zero_crossing_rate(y)[0]
        mean_zcr = float(np.mean(zcr))

        spec_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        mean_centroid = float(np.mean(spec_centroid))

        spec_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        mean_bw = float(np.mean(spec_bandwidth))

        rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)[0]
        mean_rolloff = float(np.mean(rolloff))

        contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        mean_contrast = float(np.mean(contrast))

        # Build events from heuristics
        events = []

        if mean_rms > 0.08:
            events.append({"category": "Ambient Noise", "display": "〰️ Ambient noise",
                           "raw_label": "high_energy_ambient", "confidence": 0.80})
        elif mean_rms > 0.03:
            events.append({"category": "Ambient Noise", "display": "〰️ Ambient noise",
                           "raw_label": "moderate_ambient", "confidence": 0.65})

        if mean_zcr > 0.15 and mean_rms > 0.02:
            events.append({"category": "Crowd Noise", "display": "👥 Crowd noise",
                           "raw_label": "high_zcr_crowd", "confidence": 0.72})

        if 1500 < mean_centroid < 4000:
            events.append({"category": "Human Speech", "display": "🗣️ Human speech",
                           "raw_label": "speech_freq_range", "confidence": 0.75})

        if mean_centroid > 6000:
            events.append({"category": "Aircraft", "display": "✈️ Aircraft / Jet engine",
                           "raw_label": "high_freq_broadband", "confidence": 0.60})

        if mean_contrast > 20:
            events.append({"category": "Background Music", "display": "🎵 Background music",
                           "raw_label": "harmonic_content", "confidence": 0.55})

        if mean_rms < 0.01:
            events.append({"category": "Ambient Noise", "display": "〰️ Ambient noise",
                           "raw_label": "very_quiet", "confidence": 0.90})

        if mean_bw > 3000 and mean_rms > 0.04:
            events.append({"category": "Engine noise", "display": "🔧 Engine noise",
                           "raw_label": "broadband_engine", "confidence": 0.58})

        return {
            "source": "librosa-heuristic",
            "events": events,
            "top_categories": [e["category"] for e in events],
        }

    except Exception as exc:
        print(f"[BAP librosa fallback] Error: {exc}")
        return {
            "source": "error",
            "events": [],
            "top_categories": [],
        }


# ── Public API ─────────────────────────────────────────────────────────────────

def classify_scene(file_path: str, scene_features: Optional[dict] = None) -> dict:
    """
    Full structured scene analysis for the BAP Model.

    Args:
        file_path: path to audio file
        scene_features: optional output from extract_scene_features() to avoid re-computing

    Returns:
        {
          "source": "PANNs" | "librosa-heuristic",
          "events": [ { "category", "display", "raw_label", "confidence" }, ... ],
          "top_categories": list[str],
          "scene_type": str,
          "noise_level": str,
          "crowd_detected": bool,
        }
    """
    panns_result = _classify_with_panns(file_path)

    # Derive noise/crowd from scene_features if available, else use events
    if scene_features:
        noise_level = scene_features.get("noise_level", "medium")
        crowd_detected = scene_features.get("crowd_hint", False)
    else:
        cats = panns_result.get("top_categories", [])
        crowd_detected = "Crowd Noise" in cats or "Human Speech" in cats
        # Try librosa for noise level
        try:
            import librosa, numpy as np
            y, sr = librosa.load(file_path, sr=None, mono=True, duration=30.0)
            rms = float(np.mean(librosa.feature.rms(y=y)[0]))
            noise_level = "high" if rms > 0.05 else ("medium" if rms > 0.015 else "low")
        except Exception:
            noise_level = "medium"

    categories = panns_result.get("top_categories", [])
    scene_type = _infer_scene_type(categories, noise_level, crowd_detected)

    return {
        **panns_result,
        "scene_type": scene_type,
        "noise_level": noise_level,
        "crowd_detected": crowd_detected,
    }


def detect_background_events(file_path: str) -> list[str]:
    """
    Legacy API — returns a flat list of human-readable event strings.
    Called by older code paths for backward compatibility.
    """
    result = classify_scene(file_path)
    events = result.get("events", [])
    if not events:
        return ["ambient_noise: 0.50"]
    return [f"{e['display']}: {e['confidence']:.2f}" for e in events]
