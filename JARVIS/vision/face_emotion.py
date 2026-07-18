# vision/face_emotion.py
import cv2
from deepface import DeepFace

def detect_emotion():
    cap = cv2.VideoCapture(0)  # Start webcam

    print("🧠 JARVIS Vision: Activated")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        try:
            result = DeepFace.analyze(frame, actions=['emotion'], enforce_detection=False)
            dominant_emotion = result[0]['dominant_emotion']

            # Show emotion on screen
            cv2.putText(frame, f"Emotion: {dominant_emotion}", (50, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            print(f"[Vision] Emotion Detected: {dominant_emotion}")
        except Exception as e:
            print("[Vision] Error:", e)

        # Display the video
        cv2.imshow("JARVIS - Vision Mode", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    detect_emotion()
