"""
Main application module for the stateless SubVision API integrating ARQ and Redis Pub/Sub.
"""
import asyncio
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
import redis.asyncio as aioredis
from arq import create_pool
from arq.connections import RedisSettings

from api.routers import video, processing
from api.websockets.manager import connection_manager
from api.schemas import WebSocketMessage
from core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages application startup and shutdown lifecycle events, initializing the task queue pool.
    """
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    app.state.arq_pool = await create_pool(redis_settings)
    yield
    await app.state.arq_pool.close()


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
    Handles WebSocket connections mapping Redis Pub/Sub messages to the active client.
    """
    await connection_manager.connect(websocket, client_id)

    redis_client = aioredis.from_url(settings.redis_url)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(f"ws_{client_id}")

    async def redis_reader():
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    raw_data = message["data"]
                    data_str = raw_data.decode("utf-8") if isinstance(raw_data, bytes) else raw_data
                    data = json.loads(data_str)
                    await connection_manager.send_json(client_id, data)
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    reader_task = asyncio.create_task(redis_reader())

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
    finally:
        reader_task.cancel()
        await pubsub.unsubscribe(f"ws_{client_id}")
        await redis_client.close()
