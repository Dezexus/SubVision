import asyncio
import json
import logging
import time
import shutil
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
import redis.asyncio as aioredis
from arq import create_pool
from arq.connections import RedisSettings

from api.routers import video, processing, session
from api.websockets.manager import connection_manager
from api.schemas import WebSocketMessage
from core.config import settings

logger = logging.getLogger(__name__)


async def cleanup_loop():
    while True:
        await asyncio.sleep(3600)
        temp_root = Path(settings.cache_dir) / ".temp"
        if not temp_root.exists():
            continue
        now = time.time()
        for entry in temp_root.iterdir():
            if entry.is_dir():
                try:
                    mtime = entry.stat().st_mtime
                    if now - mtime > 3600:
                        shutil.rmtree(entry, ignore_errors=True)
                        logger.info("Cleaned up stale upload: %s", entry)
                except Exception as e:
                    logger.warning("Could not clean up %s: %s", entry, e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    app.state.arq_pool = await create_pool(redis_settings)

    cleanup_task = asyncio.create_task(cleanup_loop())

    yield

    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

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
app.include_router(session.router, prefix="/api/session", tags=["Session"])

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/health")
async def health_check():
    redis_up = False
    try:
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        redis_up = True
        await r.aclose()
    except Exception:
        pass
    return {"status": "ok", "redis": redis_up}


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str) -> None:
    redis_client = aioredis.from_url(settings.redis_url)
    valid = await redis_client.getex(f"ws_valid:{client_id}", ex=3600)
    if not valid:
        await websocket.close(code=4001, reason="Invalid or expired client ID")
        await redis_client.aclose()
        return

    await connection_manager.connect(websocket, client_id)

    pubsub = None
    reader_task = None

    try:
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
            except Exception as e:
                logger.error(f"Redis reader error for {client_id}: {e}")

        reader_task = asyncio.create_task(redis_reader())

        while True:
            data = await asyncio.wait_for(websocket.receive_text(), timeout=120.0)
            try:
                message = WebSocketMessage.model_validate_json(data)
                if message.type == "ping":
                    await connection_manager.send_json(client_id, {"type": "pong"})
            except ValidationError:
                pass

    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception as e:
        logger.error(f"Unexpected WebSocket error for {client_id}: {e}")
    finally:
        connection_manager.disconnect(client_id)
        if reader_task:
            reader_task.cancel()
        if pubsub:
            try:
                await pubsub.unsubscribe(f"ws_{client_id}")
            except Exception:
                pass
        if redis_client:
            try:
                if hasattr(redis_client, "aclose"):
                    await redis_client.aclose()
                else:
                    await redis_client.close()
            except Exception:
                pass