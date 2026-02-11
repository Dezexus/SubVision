from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ИСПРАВЛЕНИЕ: Импортируем роутеры и менеджер по отдельности, чтобы избежать ошибок импорта
from app.routers import video, processing
from app.routers.processing import process_mgr
from app.websocket_manager import manager
from services.cleanup import cleanup_old_files

# LIFESPAN: Выполняется при старте и остановке сервера
@asynccontextmanager
async def lifespan(app: FastAPI):
    # При запуске: чистим мусор старше 24 часов
    try:
        cleanup_old_files(max_age_hours=24)
    except Exception as e:
        print(f"Cleanup warning: {e}")
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

# Раздача статики (SRT файлы)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket endpoint for real-time client communication."""
    await manager.connect(websocket, client_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        # Останавливаем процесс при разрыве соединения
        if process_mgr:
            process_mgr.stop_process(client_id)
