"""Module executing frame extraction, processing, and batch OCR inference synchronously."""
import logging
import time
import cv2
from typing import Any, Callable, Dict

from media.image_filters.pipeline import ImagePipeline
from ocr.engine import PaddleWrapper, get_paddle_engine
from core.presets import get_preset_config
from ocr.aggregator import SubtitleAggregator
from media.video.reader import VideoProvider
from core.constants import OCR_BATCH_SIZE

logger = logging.getLogger(__name__)

def run_ocr_pipeline(
    video_path: str,
    params: Dict[str, Any],
    log_cb: Callable[[str], None],
    progress_cb: Callable[[int, int, str], None],
    subtitle_cb: Callable[[Dict[str, Any]], None],
    cancel_check: Callable[[], bool]
) -> bool:
    cv2.setNumThreads(0)
    start_msg = "--- START OCR (Batched GPU Pipeline) ---"
    log_cb(start_msg)
    logger.info(start_msg)

    conf_threshold_pct = float(params.get("conf_threshold", 80.0))
    min_conf = conf_threshold_pct / 100.0

    preset_name = str(params.get("preset", "⚖️ Balance"))
    config = get_preset_config(preset_name)
    config.update({
        "step": params.get("step", config["step"]),
        "smart_skip": params.get("smart_skip", config["smart_skip"]),
        "scale_factor": params.get("scale_factor", config["scale_factor"]),
    })

    try:
        video = VideoProvider(video_path, step=int(config["step"]))
    except Exception as e:
        logger.error(f"Failed to initialize VideoProvider: {e}")
        raise

    logger.info(f"Video parsed successfully. Total frames: {video.total_frames}, FPS: {video.fps}")
    pipeline = ImagePipeline(roi=params.get("roi", [0, 0, 0, 0]), config=config)
    ocr_engine = get_paddle_engine(lang=str(params.get("languages", "en")), use_gpu=True)
    aggregator = SubtitleAggregator(min_conf=min_conf, fps=video.fps)
    aggregator.on_new_subtitle = subtitle_cb
    start_time = time.time()
    total_frames = video.total_frames
    batch_size = OCR_BATCH_SIZE
    pending_items = []
    valid_frames = []
    last_ocr_result = ("", 0.0)

    def _process_batch() -> None:
        nonlocal valid_frames, pending_items, last_ocr_result
        if not pending_items:
            return
        if valid_frames:
            batch_results = ocr_engine.predict_batch(valid_frames)
        else:
            batch_results = []
        res_idx = 0
        for item in pending_items:
            idx, ts, f_img, is_skip = item
            if idx > 0 and idx % 25 == 0:
                elapsed = time.time() - start_time
                eta_sec = int((total_frames - idx) * (elapsed / idx))
                progress_cb(idx, total_frames, f"{eta_sec // 60:02d}:{eta_sec % 60:02d}")
            if is_skip:
                text, conf = last_ocr_result
            elif f_img is not None:
                raw_res = batch_results[res_idx] if res_idx < len(batch_results) else None
                res_idx += 1
                try:
                    text, conf = PaddleWrapper.parse_results(raw_res, min_conf)
                except Exception:
                    text, conf = "", 0.0
                last_ocr_result = (text, conf)
            else:
                text, conf = "", 0.0
            aggregator.add_result(text, conf, ts)
        pending_items.clear()
        valid_frames.clear()

    try:
        for frame_idx, timestamp, frame in video:
            if cancel_check():
                log_cb("Process stopped by user.")
                logger.info("OCR process cancelled by user request.")
                return False
            final_img, skipped = pipeline.process(frame)
            pending_items.append((frame_idx, timestamp, final_img, skipped))
            if not skipped and final_img is not None:
                valid_frames.append(final_img)
            if len(valid_frames) >= batch_size:
                _process_batch()
        _process_batch()
        progress_cb(total_frames, total_frames, "00:00")
        aggregator.finalize()
        skip_msg = f"Smart Skip: {pipeline.skipped_count} frames"
        log_cb(skip_msg)
        logger.info(skip_msg)
        logger.info("OCR pipeline completed successfully.")
        return True
    finally:
        video.release()