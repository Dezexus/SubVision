import json
import logging
from typing import Any, Optional

from arq import ArqRedis
from arq.jobs import Job
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

ACTIVE_JOB_TTL_SEC = 86400
JOB_META_TTL_SEC = 86400

# Delete active_job only if it still points at this job_id.
_CLEAR_ACTIVE_IF_MATCH = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""

# Delete client_last_state only if its job_id matches (ACK / consume).
_ACK_LAST_STATE_IF_MATCH = """
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end
if string.find(raw, ARGV[1], 1, true) then
  return redis.call('DEL', KEYS[1])
end
return 0
"""


def parse_client_id_from_job_id(job_id: str) -> str:
    """Extract client_id from `{ocr|blur}_{client_id}_{8hex}`."""
    if "_" not in job_id:
        return "unknown"
    parts = job_id.split("_")
    if len(parts) >= 3:
        return "_".join(parts[1:-1])
    if len(parts) == 2:
        return parts[1]
    return "unknown"


def job_kind(job_id: str) -> str:
    if job_id.startswith("blur_"):
        return "blur"
    if job_id.startswith("ocr_"):
        return "ocr"
    if job_id.startswith("emotion_"):
        return "emotion"
    return "unknown"


async def clear_active_job_if_match(
    redis_conn: aioredis.Redis,
    client_id: str,
    job_id: str,
) -> bool:
    """Remove active_job:{client} only when it still references job_id."""
    if not client_id or client_id == "unknown":
        return False
    cleared = await redis_conn.eval(
        _CLEAR_ACTIVE_IF_MATCH, 1, f"active_job:{client_id}", job_id
    )
    return bool(cleared)


async def ack_client_last_state(
    redis_conn: aioredis.Redis,
    client_id: str,
    job_id: str,
) -> bool:
    """Consume terminal client_last_state for this job (deliver-once)."""
    if not client_id or not job_id:
        return False
    # Match on JSON "job_id": "<id>" fragment to avoid deleting unrelated payloads.
    needle = f'"job_id": "{job_id}"'
    cleared = await redis_conn.eval(
        _ACK_LAST_STATE_IF_MATCH, 1, f"client_last_state:{client_id}", needle
    )
    return bool(cleared)


async def set_active_job(
    redis_conn: aioredis.Redis,
    client_id: str,
    job_id: str,
    filename: str,
) -> Optional[str]:
    """Register active job + meta. Returns previous active job_id if any."""
    key = f"active_job:{client_id}"
    previous = await redis_conn.get(key)
    prev_id = previous.decode("utf-8") if previous else None

    safe_filename = filename.replace("\\", "/").split("/")[-1]
    meta = json.dumps(
        {
            "job_id": job_id,
            "client_id": client_id,
            "filename": safe_filename,
            "kind": job_kind(job_id),
        },
        default=str,
    )
    pipe = redis_conn.pipeline()
    pipe.setex(key, ACTIVE_JOB_TTL_SEC, job_id)
    pipe.setex(f"job_meta:{job_id}", JOB_META_TTL_SEC, meta)
    pipe.delete(f"client_last_state:{client_id}")
    await pipe.execute()
    return prev_id if prev_id and prev_id != job_id else None


async def touch_active_job(redis_conn: aioredis.Redis, client_id: str, job_id: str) -> None:
    """Refresh TTL while the job is still the active one (progress heartbeat)."""
    if not client_id or client_id == "unknown":
        return
    current = await redis_conn.get(f"active_job:{client_id}")
    if current and current.decode("utf-8") == job_id:
        await redis_conn.expire(f"active_job:{client_id}", ACTIVE_JOB_TTL_SEC)


async def get_job_meta(redis_conn: aioredis.Redis, job_id: str) -> Optional[dict[str, Any]]:
    raw = await redis_conn.get(f"job_meta:{job_id}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def cancel_job(
    pool: ArqRedis,
    redis_conn: aioredis.Redis,
    job_id: str,
    client_id: str | None = None,
) -> None:
    """Cancel an ARQ job and clear related Redis state (CAS on active_job)."""
    try:
        await redis_conn.setex(f"job:{job_id}:cancel", 3600, "1")

        if client_id is None:
            client_id = parse_client_id_from_job_id(job_id)

        if client_id and client_id != "unknown":
            await clear_active_job_if_match(redis_conn, client_id, job_id)

        job = Job(job_id, pool)
        await job.abort()
        logger.info("Background cancellation completed for %s", job_id)
    except Exception as e:
        logger.error("Failed to cancel job %s: %s", job_id, e)
