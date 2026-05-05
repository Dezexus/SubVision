import uuid
import logging
from fastapi import APIRouter, HTTPException
import redis.asyncio as aioredis
from core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/register")
async def register_session():
    redis_client = aioredis.from_url(settings.redis_url)
    client_id = str(uuid.uuid4())
    await redis_client.setex(f"ws_valid:{client_id}", 3600, "1")
    await redis_client.aclose()
    logger.info(f"Registered new session: {client_id}")
    return {"client_id": client_id}