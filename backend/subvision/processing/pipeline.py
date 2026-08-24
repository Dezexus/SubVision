import logging
import time
from typing import Any

from subvision.processing.ocr_engine import PaddleWrapper, get_paddle_engine
from subvision.processing.aggregator import SubtitleAggregator
from subvision.processing.filters import ImagePipeline
from subvision.processing.video_reader import VideoProvider
from subvision.processing.interfaces import OCRReporter, CancellationToken
from subvision.processing.presets import resolve_config

logger = logging.getLogger(__name__)

DET_REFRESH_INTERVAL = 30


def run_ocr_pipeline(video_path: str, params: dict[str, Any], reporter: OCRReporter, cancellation: CancellationToken) -> bool:
    logger.info("Starting OCR pipeline")

    config = resolve_config(params)
    conf_threshold_pct = float(config.get("min_conf", 80.0))
    min_conf = conf_threshold_pct / 100.0
    step = int(config.get("step", 5))

    try:
        video = VideoProvider(video_path, step=step)
    except Exception as e:
        logger.error("Failed to initialize VideoProvider: %s", e)
        raise

    logger.info(
        "Video parsed: %dx%d, %.2f fps, %d frames, OCR step=%d",
        video.width,
        video.height,
        video.fps,
        video.total_frames,
        step,
    )
    reporter.set_total(video.total_frames)

    pipeline = ImagePipeline(roi=params.get("roi", [0, 0, 0, 0]), config=config)
    ocr_engine = get_paddle_engine(lang=str(params.get("languages", "en")), use_gpu=True)
    aggregator = SubtitleAggregator(
        min_conf=min_conf,
        gap_tolerance=int(config.get("gap_tolerance", 5)),
        fps=video.fps,
        min_event_frames_mult=float(config.get("min_event_frames_mult", 2.0)),
    )
    aggregator.on_new_subtitle = reporter.subtitle

    start_time = time.time()
    total_frames = video.total_frames
    last_text = ""
    last_conf = 0.0
    frames_since_det = DET_REFRESH_INTERVAL

    try:
        for frame_idx, timestamp, frame in video:
            if cancellation.is_cancelled_sync():
                logger.info("OCR process cancelled by user request.")
                return False

            if frame_idx > 0 and frame_idx % 25 == 0:
                elapsed = time.time() - start_time
                eta_sec = int((total_frames - frame_idx) * (elapsed / frame_idx))
                reporter.progress(frame_idx, total_frames, f"{eta_sec // 60:02d}:{eta_sec % 60:02d}")

            roi_crop = pipeline.crop_roi(frame)
            if roi_crop is None:
                aggregator.add_result("", 0.0, timestamp)
                continue

            motion_skipped = pipeline.check_motion(roi_crop)

            # Forced OCR on every sampled frame (step boundary)
            final_img = pipeline.apply_filters_to_roi(roi_crop)
            if final_img is not None:
                use_det = frames_since_det >= DET_REFRESH_INTERVAL or not last_text
                raw_results = ocr_engine.predict_batch([final_img], use_det=use_det)
                text, conf = PaddleWrapper.parse_results(raw_results[0], min_conf)
                last_text, last_conf = text, conf
                aggregator.add_result(text, conf, timestamp)
                if use_det:
                    frames_since_det = 0
                else:
                    frames_since_det += step
            elif motion_skipped and pipeline.smart_skip:
                aggregator.add_result(last_text, last_conf, timestamp)
            else:
                last_text, last_conf = "", 0.0
                aggregator.add_result("", 0.0, timestamp)

        aggregator.finalize()
        skip_msg = f"Smart Skip: {pipeline.skipped_count} frames"
        reporter.log(skip_msg)
        logger.info(skip_msg)
        logger.info("OCR pipeline completed successfully.")
        return True
    finally:
        video.release()
