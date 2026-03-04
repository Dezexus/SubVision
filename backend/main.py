"""
Main application module for the stateless SubVision API.
"""
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from api.routers import video, processing
from api.websockets.manager import connection_manager
from api.schemas import WebSocketMessage
from core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages application startup and shutdown lifecycle events.
    """
    yield


app = FastAPI(title="SubVision API", version="1.0.0", lifespan=lifespan)

allowed_origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video.router, prefix="/api/video", tags=["Video"])
app.include_router(processing.router, prefix="/api/process", tags=["Processing"])

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str) -> None:
    """
    Handles WebSocket connections with strict message validation.
    """
    await connection_manager.connect(websocket, client_id)
    try:
        while True:
            data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            try:
                message = WebSocketMessage.model_validate_json(data)
                if message.type == "ping":
                    await connection_manager.send_json(client_id, {"type": "pong"})
            except ValidationError:
                pass
    except (WebSocketDisconnect, asyncio.TimeoutError):
        connection_manager.disconnect(client_id)
