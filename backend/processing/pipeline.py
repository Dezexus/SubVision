import logging
import time
from typing import Any, Dict

from processing.ocr_engine import PaddleWrapper, get_paddle_engine
from processing.aggregator import SubtitleAggregator
from processing.filters import ImagePipeline
from processing.video_reader import VideoProvider
from processing.interfaces import OCRReporter
from processing.presets import get_preset_config

logger = logging.getLogger(__name__)

def run_ocr_pipeline(
    video_path: str,
    params: Dict[str, Any],
    reporter: OCRReporter,
    cancel_check: callable
) -> bool:
    logger.info("Starting OCR pipeline")

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
    reporter.set_total(video.total_frames)

    pipeline = ImagePipeline(roi=params.get("roi", [0, 0, 0, 0]), config=config)
    ocr_engine = get_paddle_engine(lang=str(params.get("languages", "en")), use_gpu=True)
    aggregator = SubtitleAggregator(min_conf=min_conf, fps=video.fps)
    aggregator.on_new_subtitle = reporter.subtitle

    start_time = time.time()
    total_frames = video.total_frames

    try:
        for frame_idx, timestamp, frame in video:
            if cancel_check():
                reporter.log("Process stopped by user.")
                logger.info("OCR process cancelled by user request.")
                return False

            final_img, skipped = pipeline.process(frame)

            if frame_idx > 0 and frame_idx % 25 == 0:
                elapsed = time.time() - start_time
                eta_sec = int((total_frames - frame_idx) * (elapsed / frame_idx))
                reporter.progress(frame_idx, total_frames, f"{eta_sec // 60:02d}:{eta_sec % 60:02d}")

            if skipped:
                continue

            if final_img is not None:
                raw_res = ocr_engine.predict_batch([final_img])
                text, conf = PaddleWrapper.parse_results(raw_res[0], min_conf)
                aggregator.add_result(text, conf, timestamp)
            else:
                aggregator.add_result("", 0.0, timestamp)

        aggregator.finalize()
        skip_msg = f"Smart Skip: {pipeline.skipped_count} frames"
        reporter.log(skip_msg)
        logger.info(skip_msg)
        logger.info("OCR pipeline completed successfully.")
        return True
    finally:
        video.release()