"""Redis-backed admin overrides for emotion export settings."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

import redis.asyncio as aioredis

from subvision.core.config import settings
from subvision.core.config_merge import merge_emotion_settings
from subvision.domain.emotion_models import EmotionAnalysisSettings

logger = logging.getLogger(__name__)

ADMIN_EMOTION_KEY = "admin:config:emotion_export"
EMOTION_CACHE_PREFIX = "emotion:cache:"
RECENT_JOBS_KEY = "admin:jobs:emotion:recent"
RECENT_JOBS_MAX = 50


def env_emotion_defaults() -> EmotionAnalysisSettings:
    """Static defaults from domain models (env overrides via Settings later)."""
    return EmotionAnalysisSettings()


async def load_admin_patch(redis: aioredis.Redis) -> Optional[Dict[str, Any]]:
    raw = await redis.get(ADMIN_EMOTION_KEY)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Invalid admin emotion config in Redis")
        return None


async def save_admin_patch(redis: aioredis.Redis, patch: Dict[str, Any]) -> None:
    await redis.set(ADMIN_EMOTION_KEY, json.dumps(patch, default=str))


async def clear_admin_patch(redis: aioredis.Redis) -> None:
    await redis.delete(ADMIN_EMOTION_KEY)


async def get_effective_emotion_settings(
    redis: aioredis.Redis,
    request_patch: Optional[Dict[str, Any]] = None,
) -> EmotionAnalysisSettings:
    admin = await load_admin_patch(redis)
    base = env_emotion_defaults()
    if not settings.emotion_export_enabled:
        base.export.enabled = False
    return merge_emotion_settings(base, admin, request_patch)


async def record_emotion_job(redis: aioredis.Redis, entry: Dict[str, Any]) -> None:
    raw = await redis.get(RECENT_JOBS_KEY)
    jobs: list = []
    if raw:
        try:
            jobs = json.loads(raw)
        except json.JSONDecodeError:
            jobs = []
    jobs.insert(0, entry)
    jobs = jobs[:RECENT_JOBS_MAX]
    await redis.set(RECENT_JOBS_KEY, json.dumps(jobs, default=str))


async def get_recent_emotion_jobs(redis: aioredis.Redis) -> list:
    raw = await redis.get(RECENT_JOBS_KEY)
    if not raw:
        return []
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return []


async def clear_emotion_cache(redis: aioredis.Redis) -> int:
    deleted = 0
    async for key in redis.scan_iter(match=f"{EMOTION_CACHE_PREFIX}*"):
        await redis.delete(key)
        deleted += 1
    return deleted
