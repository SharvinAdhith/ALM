# main.py
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="whisper")
warnings.filterwarnings("ignore", category=UserWarning, module="pygame.pkgdata")

from audio.audio_engine import record_audio, transcribe_audio
from speech.speech_engine import SpeechEngine
from memory.memory_engine import MemoryEngine
from nlp.nlp_engine import NLPEngine
from nlp.indent_nlp import CoreBrain

# New imports
from nlp.gpt_response import GPTResponder
from nlp.embedding_client import EmbeddingClient
from memory.semantic_memory import SemanticMemory
from memory.rag_retriever import RAGRetriever
from tools.function_router import FunctionRouter

def main():
    print("🎬 Booting up JARVIS...")

    speaker = SpeechEngine()
    memory = MemoryEngine()
    nlp = NLPEngine()

    # Vector memory wiring
    embedder = EmbeddingClient()
    semantic = SemanticMemory(embedder, persist_dir="vector_store", collection_name="jarvis_memories")

    gpt_responder = GPTResponder(memory)
    rag = RAGRetriever(semantic_memory=semantic, gpt_responder=gpt_responder, decay_days=30.0)

    # Create function router and pass memory for local tools
    tool_router = FunctionRouter(gpt_responder=gpt_responder, memory_engine=memory, allowed_read_dirs=["."])

    brain = CoreBrain(memory, speaker, nlp, semantic, gpt_responder, rag, tool_router=tool_router)

    speaker.speak("Hello, I am JARVIS. Ready to serve you.")

    while True:
        try:
            print("\n🎤 Listening for your command...")
            record_audio()
            command = transcribe_audio()

            if not command.strip():
                print("⚠️ Nothing captured. Try again.")
                continue

            print(f"🧠 User said: {command}")
            intents, data = nlp.parse(command)
            print(f"🔍 Parsed Intent: {intents}")

            brain.route(intents, data)

        except KeyboardInterrupt:
            print("\n👋 JARVIS shutting down.")
            speaker.speak("Goodbye.")
            break
        except Exception as e:
            print("❌ Error in main loop:", e)
            speaker.speak("An error occurred. Please check my systems.")

if __name__ == "__main__":
    main()
