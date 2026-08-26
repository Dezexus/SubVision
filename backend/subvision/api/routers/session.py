import json
import logging
from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel

from subvision.core.jobs import (
    ack_client_last_state,
    cancel_job,
    get_job_meta,
    job_kind,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class CancelRequest(BaseModel):
    client_id: str


class AckRequest(BaseModel):
    client_id: str
    job_id: str


@router.post("/register")
async def register_session(request: Request):
    return {"status": "ok"}


@router.get("/status/{client_id}")
async def get_session_status(client_id: str, request: Request):
    """Return active job snapshot, or a one-shot terminal state if idle."""
    redis_conn = request.app.state.redis
    job_id_bytes = await redis_conn.get(f"active_job:{client_id}")
    job_id = job_id_bytes.decode("utf-8") if job_id_bytes else None

    last_state = None
    filename = None
    kind = None

    if job_id:
        kind = job_kind(job_id)
        meta = await get_job_meta(redis_conn, job_id)
        if meta:
            filename = meta.get("filename")
            kind = meta.get("kind") or kind

        state_bytes = await redis_conn.get(f"job_status:{job_id}")
        if state_bytes:
            try:
                last_state = json.loads(state_bytes)
            except json.JSONDecodeError:
                pass
        # While a job is active, never fall back to a previous job's finish.
    else:
        client_state = await redis_conn.get(f"client_last_state:{client_id}")
        if client_state:
            try:
                last_state = json.loads(client_state)
                stale_job = last_state.get("job_id") if isinstance(last_state, dict) else None
                if stale_job:
                    kind = job_kind(stale_job)
                    meta = await get_job_meta(redis_conn, stale_job)
                    if meta:
                        filename = meta.get("filename")
                        kind = meta.get("kind") or kind
            except json.JSONDecodeError:
                pass

    return {
        "has_active_job": job_id is not None,
        "job_id": job_id,
        "filename": filename,
        "kind": kind,
        "last_state": last_state,
    }


@router.post("/ack")
async def ack_session_state(req: AckRequest, request: Request):
    """Client confirms it consumed a terminal finish/error (deliver-once)."""
    redis_conn = request.app.state.redis
    cleared = await ack_client_last_state(redis_conn, req.client_id, req.job_id)
    return {"status": "acked" if cleared else "noop"}


async def _cancel_in_background(pool, redis_conn, job_id: str, client_id: str):
    """Execute cancellation logic reliably in the background."""
    await cancel_job(pool, redis_conn, job_id, client_id)


@router.post("/jobs/{job_id}/cancel")
async def cancel_job_endpoint(
    job_id: str, req: CancelRequest, request: Request, background_tasks: BackgroundTasks
):
    pool = request.app.state.arq_pool
    redis_conn = request.app.state.redis
    background_tasks.add_task(_cancel_in_background, pool, redis_conn, job_id, req.client_id)
    return {"status": "cancelling"}
