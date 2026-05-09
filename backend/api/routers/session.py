from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from pydantic import BaseModel
import logging

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
    job_id = await redis_conn.get(f"active_job:{client_id}")
    return {
        "has_active_job": job_id is not None,
        "job_id": job_id.decode("utf-8") if job_id else None
    }

async def _cancel_in_background(pool, redis_conn, job_id: str, client_id: str):
    """Execute cancellation logic reliably in the background."""
    try:
        # 1. Сначала ставим флаг для нашей ядовитой пилюли (worker.py)
        await redis_conn.setex(f"job:{job_id}:cancel", 3600, "1")
        
        # 2. Очищаем активную сессию пользователя
        await redis_conn.delete(f"active_job:{client_id}")
        
        # 3. Сообщаем библиотеке arq, что задачу нужно прервать
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
    
    # Добавляем задачу в фон. Сервер вернет 200 OK мгновенно, а отмена выполнится надежно.
    background_tasks.add_task(_cancel_in_background, pool, redis_conn, job_id, req.client_id)
    
    return {"status": "cancelling"}