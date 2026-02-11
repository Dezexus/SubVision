from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import video, processing
from app.websocket_manager import manager

app = FastAPI(title="SubVision API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video.router, prefix="/api/video", tags=["Video"])
app.include_router(processing.router, prefix="/api/process", tags=["Processing"])

# Mount uploads to serve generated SRTs if needed, or handle via dedicated endpoint
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket endpoint for real-time client communication."""
    await manager.connect(websocket, client_id)
    try:
        while True:
            # Keep connection open and listen for client messages if necessary
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_id)
