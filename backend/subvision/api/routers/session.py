import json
import logging
from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel

from subvision.core.jobs import cancel_job

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
        # While a job is active, never fall back to a previous job's finish
        # (e.g. OCR finish must not abort a newly started blur render).
    else:
        # Fallback only when idle: finished jobs clear active_job, but client may
        # have missed the WS finish (background tab).
        client_state = await redis_conn.get(f"client_last_state:{client_id}")
        if client_state:
            try:
                last_state = json.loads(client_state)
            except json.JSONDecodeError:
                pass

    return {
        "has_active_job": job_id is not None,
        "job_id": job_id,
        "last_state": last_state,
    }


async def _cancel_in_background(pool, redis_conn, job_id: str, client_id: str):
    """Execute cancellation logic reliably in the background."""
    await cancel_job(pool, redis_conn, job_id, client_id)


@router.post("/jobs/{job_id}/cancel")
async def cancel_job_endpoint(job_id: str, req: CancelRequest, request: Request, background_tasks: BackgroundTasks):
    pool = request.app.state.arq_pool
    redis_conn = request.app.state.redis
    background_tasks.add_task(_cancel_in_background, pool, redis_conn, job_id, req.client_id)
    return {"status": "cancelling"}
