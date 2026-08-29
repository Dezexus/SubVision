"""Admin configuration and monitoring endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from subvision.api.admin_auth import require_admin
from subvision.core.admin_config import (
    clear_admin_patch,
    clear_emotion_cache,
    env_emotion_defaults,
    get_effective_emotion_settings,
    get_recent_emotion_jobs,
    load_admin_patch,
    save_admin_patch,
)
from subvision.core.config import settings
from subvision.core.config_merge import _deep_merge
from subvision.processing.diarization_engine import pyannote_available
from subvision.processing.emotion_engine import gigaam_available, model_weights_cached

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(require_admin)])


class EmotionConfigPatch(BaseModel):
    export: Optional[Dict[str, Any]] = None
    diarization: Optional[Dict[str, Any]] = None
    gender: Optional[Dict[str, Any]] = None
    json_format: Optional[Dict[str, Any]] = None


@router.get("/status")
async def admin_status(request: Request) -> Dict[str, Any]:
    redis = request.app.state.redis
    redis_ok = False
    try:
        await redis.ping()
        redis_ok = True
    except Exception:
        pass
    return {
        "redis": redis_ok,
        "admin_enabled": settings.admin_enabled,
        "emotion_export_enabled": settings.emotion_export_enabled,
        "hf_token_configured": bool(settings.hf_token),
        "gigaam_available": gigaam_available(),
        "gigaam_weights_cached": model_weights_cached(),
        "pyannote_available": pyannote_available(),
    }


@router.get("/config/emotion-export")
async def get_emotion_config(request: Request) -> Dict[str, Any]:
    redis = request.app.state.redis
    admin_patch = await load_admin_patch(redis)
    effective = await get_effective_emotion_settings(redis)
    return {
        "env_defaults": env_emotion_defaults().model_dump(),
        "admin_patch": admin_patch,
        "effective": effective.model_dump(),
    }


@router.patch("/config/emotion-export")
async def patch_emotion_config(body: EmotionConfigPatch, request: Request) -> Dict[str, Any]:
    redis = request.app.state.redis
    current = await load_admin_patch(redis) or {}
    patch = body.model_dump(exclude_none=True)
    merged = _deep_merge(current, patch)
    await save_admin_patch(redis, merged)
    effective = await get_effective_emotion_settings(redis)
    return {"status": "ok", "effective": effective.model_dump()}


@router.post("/config/emotion-export/reset")
async def reset_emotion_config(request: Request) -> Dict[str, Any]:
    redis = request.app.state.redis
    await clear_admin_patch(redis)
    effective = await get_effective_emotion_settings(redis)
    return {"status": "reset", "effective": effective.model_dump()}


@router.post("/cache/emotion/clear")
async def clear_cache(request: Request) -> Dict[str, Any]:
    redis = request.app.state.redis
    deleted = await clear_emotion_cache(redis)
    return {"status": "ok", "deleted_keys": deleted}


@router.get("/jobs/recent")
async def recent_jobs(request: Request) -> Dict[str, Any]:
    redis = request.app.state.redis
    jobs = await get_recent_emotion_jobs(redis)
    return {"jobs": jobs}
