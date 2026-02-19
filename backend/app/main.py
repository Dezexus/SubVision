"""
Main application module for the SubVision API with strict CORS policy and background tasks.
"""
import asyncio
import json
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import video, processing
from app.routers.processing import process_mgr
from app.websocket_manager import manager
from services.cleanup import cleanup_old_files

async def periodic_cleanup(interval_seconds: int = 3600, max_age_hours: int = 12):
    """Executes file cleanup periodically in the background."""
    while True:
        try:
            cleanup_old_files(max_age_hours=max_age_hours)
        except Exception as e:
            print(f"Periodic cleanup error: {e}")
        await asyncio.sleep(interval_seconds)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages application startup and shutdown lifecycle events."""
    cleanup_task = asyncio.create_task(periodic_cleanup())
    yield
    cleanup_task.cancel()

app = FastAPI(title="SubVision API", version="1.0.0", lifespan=lifespan)

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:7860,http://127.0.0.1:7860")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

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
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """Handles WebSocket connections with a ping/pong Heartbeat mechanism."""
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            try:
                payload = json.loads(data)
                if payload.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass
    except (WebSocketDisconnect, asyncio.TimeoutError):
        manager.disconnect(client_id)
        if process_mgr:
            process_mgr.stop_process(client_id)
