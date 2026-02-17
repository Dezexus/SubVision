"""
Main application file for the SubVision API.
This script initializes the FastAPI application, configures middleware,
includes API routers, and sets up WebSocket and static file handling.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import video, processing
from app.routers.processing import process_mgr
from app.websocket_manager import manager
from services.cleanup import cleanup_old_files

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the application's lifespan events.
    On startup, it triggers a cleanup of old files.
    """
    try:
        cleanup_old_files(max_age_hours=24)
    except Exception as e:
        print(f"Cleanup warning on startup: {e}")
    yield
    pass

app = FastAPI(title="SubVision API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video.router, prefix="/api/video", tags=["Video"])
app.include_router(processing.router, prefix="/api/process", tags=["Processing"])

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    Handles the WebSocket connection for a given client. It manages the
    connection lifecycle and ensures that any running process associated
    with the client is stopped upon disconnection.
    """
    await manager.connect(websocket, client_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        if process_mgr:
            process_mgr.stop_process(client_id)

