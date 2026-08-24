import asyncio
import json
import logging
import time
import shutil
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
import redis.asyncio as aioredis
from arq import create_pool
from arq.connections import RedisSettings

from subvision.api.routers import video, processing, session
from subvision.api.websockets.manager import connection_manager
from subvision.api.schemas import WebSocketMessage
from subvision.core.config import settings
from subvision.core.logging_config import setup_logging

setup_logging(settings.log_level)

logger = logging.getLogger(__name__)


async def cleanup_loop() -> None:
    """Periodic background task to clean temporary files older than 24 hours."""
    while True:
        try:
            temp_root = Path(settings.cache_dir) / ".temp"
            if temp_root.exists():
                now = time.time()
                for entry in temp_root.iterdir():
                    try:
                        mtime = entry.stat().st_mtime
                        if now - mtime > 86400:
                            if entry.is_dir():
                                shutil.rmtree(entry, ignore_errors=True)
                            elif entry.is_file():
                                entry.unlink(missing_ok=True)
                    except OSError as e:
                        logger.debug("Cleanup skip for %s: %s", entry, e)
        except Exception as e:
            logger.error("Cleanup loop error: %s", e)
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    app.state.arq_pool = await create_pool(redis_settings)
    app.state.redis = aioredis.from_url(settings.redis_url)
    cleanup_task = asyncio.create_task(cleanup_loop())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await app.state.arq_pool.close()
    await app.state.redis.aclose()


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
app.include_router(session.router, prefix="/api/session", tags=["Session"])

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/health")
async def health_check(request: Request):
    """Health check endpoint."""
    redis_up = False
    try:
        await request.app.state.redis.ping()
        redis_up = True
    except Exception as e:
        logger.warning("Redis health check failed: %s", e)
    return {"status": "ok", "redis": redis_up}


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str) -> None:
    """Websocket connection endpoint supporting auto-reconnect."""
    redis_client = websocket.app.state.redis
    await connection_manager.connect(websocket, client_id)
    pubsub = None
    reader_task = None
    try:
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"ws_{client_id}")

        async def redis_reader():
            while True:
                try:
                    async for message in pubsub.listen():
                        if message["type"] == "message":
                            raw_data = message["data"]
                            data_str = raw_data.decode("utf-8") if isinstance(raw_data, bytes) else raw_data
                            data = json.loads(data_str)
                            await connection_manager.send_json(client_id, data)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error("Redis reader error for %s: %s", client_id, e)
                    await asyncio.sleep(2)

        reader_task = asyncio.create_task(redis_reader())

        while True:
            data = await asyncio.wait_for(websocket.receive_text(), timeout=120.0)
            try:
                message = WebSocketMessage.model_validate_json(data)
                if message.type == "ping":
                    await connection_manager.send_json(client_id, {"type": "pong"})
            except ValidationError:
                logger.debug("Invalid WS message from %s", client_id)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        logger.debug("WebSocket disconnected or timed out for %s", client_id)
    except Exception as e:
        logger.warning("WebSocket error for %s: %s", client_id, e)
    finally:
        connection_manager.disconnect(client_id)
        if reader_task:
            reader_task.cancel()
        if pubsub:
            try:
                await pubsub.unsubscribe(f"ws_{client_id}")
                await pubsub.close()
            except Exception as e:
                logger.debug("PubSub cleanup failed for %s: %s", client_id, e)
