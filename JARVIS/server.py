import os
import shutil
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from speech.speech_engine import SpeechEngine
from memory.memory_engine import MemoryEngine
from nlp.nlp_engine import NLPEngine
from nlp.indent_nlp import CoreBrain
from nlp.gpt_response import GPTResponder
from nlp.embedding_client import EmbeddingClient
from memory.semantic_memory import SemanticMemory
from memory.rag_retriever import RAGRetriever
from tools.function_router import FunctionRouter
from audio.audio_engine import transcribe_audio

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Booting JARVIS Core Models for FastAPI...")
speaker = SpeechEngine()
memory = MemoryEngine()
nlp = NLPEngine()
embedder = EmbeddingClient()
semantic = SemanticMemory(embedder, persist_dir="vector_store", collection_name="jarvis_memories")
gpt_responder = GPTResponder(memory)
rag = RAGRetriever(semantic, gpt_responder, decay_days=30.0)
tool_router = FunctionRouter(gpt_responder, memory, allowed_read_dirs=["."])

brain = CoreBrain(memory, speaker, nlp, semantic, gpt_responder, rag, tool_router=tool_router)

class ChatRequest(BaseModel):
    text: str

@app.post("/api/chat/text")
async def chat_text(request: ChatRequest):
    print(f"🧠 Web User said: {request.text}")
    intents, data = nlp.parse(request.text)
    print(f"🔍 Parsed Intent: {intents}")
    response, emotion = brain.route(intents, data)
    return {"response": response, "emotion": emotion}

@app.post("/api/chat/audio")
async def chat_audio(file: UploadFile = File(...)):
    cache_path = "cache"
    os.makedirs(cache_path, exist_ok=True)
    filename = os.path.join(cache_path, "web_input.wav")
    
    with open(filename, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    print("🎤 Web User submitted an audio blob. Transcribing...")
    try:
        command = transcribe_audio(filename)
    except Exception as e:
        print("Trancsription failed: ", e)
        return {"response": "Speech to text processing failed locally.", "emotion": "error", "transcription": ""}
        
    if not command.strip():
        return {"response": "I didn't catch that.", "emotion": "neutral", "transcription": ""}
        
    print(f"🧠 Transcribed: {command}")
    intents, data = nlp.parse(command)
    response, emotion = brain.route(intents, data)
    
    return {"response": response, "emotion": emotion, "transcription": command}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
