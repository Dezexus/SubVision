import logging

from arq import ArqRedis
from arq.jobs import Job
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)


async def cancel_job(
    pool: ArqRedis,
    redis_conn: aioredis.Redis,
    job_id: str,
    client_id: str | None = None,
) -> None:
    """Cancel an ARQ job and clear related Redis state."""
    try:
        await redis_conn.setex(f"job:{job_id}:cancel", 3600, "1")

        if client_id is None and "_" in job_id:
            client_id = job_id.split("_", 1)[1].rsplit("_", 1)[0]

        if client_id and client_id != "unknown":
            await redis_conn.delete(f"active_job:{client_id}")

        job = Job(job_id, pool)
        await job.abort()
        logger.info("Background cancellation completed for %s", job_id)
    except Exception as e:
        logger.error("Failed to cancel job %s: %s", job_id, e)
