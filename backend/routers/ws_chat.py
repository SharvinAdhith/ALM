from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
import logging
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

manager = ConnectionManager()

@router.websocket("/chat")
async def websocket_chat(websocket: WebSocket):
    # Depending on auth, you might decode a token from query params: ?token=...
    await manager.connect(websocket)
    try:
        from backend.services.jarvis_service import jarvis_service
        while True:
            data = await websocket.receive_text()
            logger.info(f"WS received text: {data}")
            
            # Send initial acknowledgment
            await manager.send_personal_message(f"processing...", websocket)
            
            # Generate stream
            try:
                # Use the streaming service to send token by token over WS
                async for token in jarvis_service.chat_stream(data):
                    await manager.send_personal_message(token, websocket)
                    
                await manager.send_personal_message("[DONE]", websocket)
            except Exception as e:
                logger.error(f"WS chat streaming error: {e}")
                await manager.send_personal_message("[ERROR]", websocket)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("WS Client disconnected")
