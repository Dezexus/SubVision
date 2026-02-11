import os
import asyncio
from fastapi import APIRouter, HTTPException
from app.schemas import ProcessConfig
from app.websocket_manager import manager
from services.process_manager import ProcessManager

router = APIRouter()
process_mgr = ProcessManager()
UPLOAD_DIR = "uploads"

@router.post("/start")
async def start_process(config: ProcessConfig):
    """Initializes and starts the background OCR worker."""
    # CRITICAL FIX: Sanitize filename
    safe_filename = os.path.basename(config.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    loop = asyncio.get_event_loop()

    def _emit(event_type: str, payload: dict):
        asyncio.run_coroutine_threadsafe(
            manager.send_json(config.client_id, {"type": event_type, **payload}),
            loop
        )

    callbacks = {
        "log": lambda msg: _emit("log", {"message": msg}),
        "subtitle": lambda item: _emit("subtitle_new", {"item": item}),
        "ai_update": lambda item: _emit("subtitle_update", {"item": item}),
        "progress": lambda c, t, e: _emit("progress", {"current": c, "total": t, "eta": e}),
        "finish": lambda success: _emit("finish", {"success": success})
    }

    try:
        process_mgr.start_process(
            session_id=config.client_id,
            video_file=file_path,
            editor_data={"roi_override": config.roi},
            langs=config.languages,
            step=config.step,
            conf_threshold=config.conf_threshold,
            use_llm=config.use_llm,
            clahe_val=config.clahe_limit,
            scale_val=config.scale_factor,
            smart_skip=config.smart_skip,
            visual_cutoff=config.visual_cutoff,
            llm_repo=config.llm_repo,
            llm_file=config.llm_filename,
            llm_prompt=config.llm_prompt,
            callbacks=callbacks
        )
        return {"status": "started", "job_id": config.client_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stop/{client_id}")
async def stop_process(client_id: str):
    """Stops the active processing job for a client."""
    success = process_mgr.stop_process(client_id)
    return {"status": "stopped"}
