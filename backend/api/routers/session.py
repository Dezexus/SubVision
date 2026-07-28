import json
import logging
from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

class CancelRequest(BaseModel):
    client_id: str

@router.post("/register")
async def register_session(request: Request):
    return {"status": "ok"}

@router.get("/status/{client_id}")
async def get_session_status(client_id: str, request: Request):
    redis_conn = request.app.state.redis
    job_id_bytes = await redis_conn.get(f"active_job:{client_id}")
    job_id = job_id_bytes.decode("utf-8") if job_id_bytes else None

    last_state = None
    if job_id:
        state_bytes = await redis_conn.get(f"job_status:{job_id}")
        if state_bytes:
            try:
                last_state = json.loads(state_bytes)
            except json.JSONDecodeError:
                pass

    return {
        "has_active_job": job_id is not None,
        "job_id": job_id,
        "last_state": last_state
    }

async def _cancel_in_background(pool, redis_conn, job_id: str, client_id: str):
    """Execute cancellation logic reliably in the background."""
    try:
        await redis_conn.setex(f"job:{job_id}:cancel", 3600, "1")
        await redis_conn.delete(f"active_job:{client_id}")
        from arq.jobs import Job
        job = Job(job_id, pool)
        await job.abort()
        logger.info(f"Background cancellation completed for {job_id}")
    except Exception as e:
        logger.error(f"Failed to execute background cancel for job {job_id}: {e}")

@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, req: CancelRequest, request: Request, background_tasks: BackgroundTasks):
    pool = request.app.state.arq_pool
    redis_conn = request.app.state.redis
    background_tasks.add_task(_cancel_in_background, pool, redis_conn, job_id, req.client_id)
    return {"status": "cancelling"}