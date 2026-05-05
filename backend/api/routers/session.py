import uuid
import logging
from fastapi import APIRouter, HTTPException, Request
from core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/register")
async def register_session(request: Request):
    redis_client = request.app.state.redis
    client_id = str(uuid.uuid4())
    await redis_client.setex(f"ws_valid:{client_id}", 3600, "1")
    logger.info(f"Registered new session: {client_id}")
    return {"client_id": client_id}