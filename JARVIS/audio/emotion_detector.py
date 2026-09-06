import os

_emotion_model = None

def get_emotion_model():
    global _emotion_model
    if _emotion_model is None:
        try:
            from speechbrain.pretrained import EncoderClassifier
            print("Lazy loading SpeechBrain Wav2Vec2.0 model...")
            # We save it to a specific directory to avoid redownloads
            _emotion_model = EncoderClassifier.from_hparams(
                source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
                savedir="tmp_speechbrain"
            )
        except ImportError:
            print("Warning: speechbrain not installed. Mocking Emotion.")
            return None
    return _emotion_model

def detect_emotion(file_path):
    model = get_emotion_model()
    if model is None:
        return "neutral"
    
    try:
        import torchaudio
        signal, fs = torchaudio.load(file_path)
        # Resample to 16kHz if needed
        if fs != 16000:
            import torchaudio.transforms as T
            resampler = T.Resample(fs, 16000, dtype=signal.dtype)
            signal = resampler(signal)
            
        out_prob, score, index, text_lab = model.classify_batch(signal)
        emotion = text_lab[0].lower() if text_lab and len(text_lab) > 0 else "neutral"
        return emotion
    except Exception as e:
        print(f"Error in Emotion Detection: {e}")
        return "neutral"
