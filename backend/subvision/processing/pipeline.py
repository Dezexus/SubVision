import logging
import time
from dataclasses import dataclass
from typing import Any

from subvision.processing.ocr_engine import PaddleWrapper, get_paddle_engine
from subvision.processing.aggregator import SubtitleAggregator, SubtitleItem
from subvision.processing.edge_refine import refine_subtitle_boundaries
from subvision.processing.filters import ImagePipeline
from subvision.processing.video_reader import VideoProvider
from subvision.processing.interfaces import OCRReporter, CancellationToken
from subvision.processing.presets import resolve_config

logger = logging.getLogger(__name__)

MAX_REGIONS = 3


def resolve_rois(params: dict[str, Any]) -> list[list[int]]:
    """One ROI per subtitle track. `rois` wins over the legacy single `roi`."""
    rois = [list(r) for r in (params.get("rois") or []) if r and len(r) == 4]
    if not rois:
        rois = [list(params.get("roi") or [0, 0, 0, 0])]
    return rois[:MAX_REGIONS]


@dataclass
class _Track:
    index: int
    pipeline: ImagePipeline
    aggregator: SubtitleAggregator
    last_text: str = ""
    last_conf: float = 0.0
    # An empty ROI means "whole frame" only for the first region; extra empty
    # regions are placeholders and must not OCR the whole frame.
    enabled: bool = True


def merge_tracks(per_track: list[list[SubtitleItem]]) -> list[SubtitleItem]:
    """Tag items with their track, order by start, and number them globally."""
    merged = [{**item, "track": t} for t, items in enumerate(per_track) for item in items]
    merged.sort(key=lambda it: (it["start"], it["track"]))
    for i, item in enumerate(merged, start=1):
        item["id"] = i
    return merged


def run_ocr_pipeline(video_path: str, params: dict[str, Any], reporter: OCRReporter, cancellation: CancellationToken) -> list[dict[str, Any]] | None:
    logger.info("Starting OCR pipeline")

    config = resolve_config(params)
    conf_threshold_pct = float(config.get("min_conf", 80.0))
    min_conf = conf_threshold_pct / 100.0
    step = int(config.get("step", 5))
    rois = resolve_rois(params)

    try:
        video = VideoProvider(video_path, step=step)
    except Exception as e:
        logger.error("Failed to initialize VideoProvider: %s", e)
        raise

    logger.info(
        "Video parsed: %dx%d, %.2f fps, %d frames, OCR step=%d, regions=%d",
        video.width,
        video.height,
        video.fps,
        video.total_frames,
        step,
        len(rois),
    )
    reporter.set_total(video.total_frames)

    ocr_engine = get_paddle_engine(lang=str(params.get("languages", "en")), use_gpu=True)

    # Live subtitle_new events need IDs unique across tracks; the final list is
    # renumbered by merge_tracks.
    live_ids = iter(range(1, 1 << 62))

    def _make_track(index: int, roi: list[int]) -> _Track:
        aggregator = SubtitleAggregator(
            min_conf=min_conf,
            gap_tolerance=int(config.get("gap_tolerance", 5)),
            fps=video.fps,
            min_event_frames_mult=float(config.get("min_event_frames_mult", 2.0)),
            step=step,
        )
        aggregator.on_new_subtitle = lambda item: reporter.subtitle({**item, "id": next(live_ids), "track": index})
        enabled = index == 0 or (roi[2] > 0 and roi[3] > 0)
        return _Track(index, ImagePipeline(roi=roi, config=config), aggregator, enabled=enabled)

    tracks = [_make_track(i, roi) for i, roi in enumerate(rois)]

    start_time = time.time()
    total_frames = video.total_frames

    try:
        for frame_idx, timestamp, frame in video:
            if cancellation.is_cancelled_sync():
                logger.info("OCR process cancelled by user request.")
                return None

            if frame_idx > 0 and frame_idx % 25 == 0:
                elapsed = time.time() - start_time
                eta_sec = int((total_frames - frame_idx) * (elapsed / frame_idx))
                reporter.progress(frame_idx, total_frames, f"{eta_sec // 60:02d}:{eta_sec % 60:02d}")

            pending: list[tuple[_Track, Any]] = []
            for track in tracks:
                if not track.enabled:
                    continue
                roi_crop = track.pipeline.crop_roi(frame)
                if roi_crop is None:
                    track.aggregator.add_result("", 0.0, timestamp)
                    continue

                motion_skipped = track.pipeline.check_motion(roi_crop)
                if motion_skipped and track.pipeline.smart_skip:
                    # The ROI is unchanged: reuse the last observation without
                    # repeating denoise and OCR. Periodic forced frames are still
                    # controlled by ImagePipeline.max_continuous_skips.
                    track.aggregator.add_result(track.last_text, track.last_conf, timestamp)
                    continue

                final_img = track.pipeline.apply_filters_to_roi(roi_crop)
                if final_img is None:
                    track.last_text, track.last_conf = "", 0.0
                    track.aggregator.add_result("", 0.0, timestamp)
                else:
                    pending.append((track, final_img))

            if pending:
                raw_results = ocr_engine.predict_batch([img for _, img in pending])
                for (track, _img), raw in zip(pending, raw_results, strict=True):
                    if raw is None:
                        # Inference failed, so "no text" is unknown: re-OCR the next
                        # sample instead of letting smart skip repeat this result.
                        track.pipeline.last_raw_roi = None
                    text, conf = PaddleWrapper.parse_results(raw, min_conf)
                    track.last_text, track.last_conf = text, conf
                    track.aggregator.add_result(text, conf, timestamp)

        items = merge_tracks([track.aggregator.finalize() for track in tracks])

        # Frame-accurate edges: OCR every frame in ±step around each coarse boundary.
        window = max(step, 3)
        reporter.log(f"Refining boundaries (±{window} frames) for {len(items)} cues...")
        logger.info("Edge refine window=%d frames, cues=%d", window, len(items))

        def _on_refine_progress(done: int, total: int) -> None:
            # Keep bar under 100% until the worker sends finish.
            almost = max(total_frames - 1, 1)
            reporter.progress(almost, total_frames, f"refine {done}/{total}")

        items = refine_subtitle_boundaries(
            items=items,
            video_path=video_path,
            image_pipeline=[track.pipeline for track in tracks],
            ocr_engine=ocr_engine,
            min_conf=min_conf,
            fps=video.fps,
            total_frames=total_frames,
            window_frames=window,
            abut_gap_max=tracks[0].aggregator.abut_gap_max,
            cancellation=cancellation,
            on_progress=_on_refine_progress,
        )

        if cancellation.is_cancelled_sync():
            return None

        reporter.subtitles_replace(items)
        skipped = sum(track.pipeline.skipped_count for track in tracks)
        skip_msg = f"Smart Skip: {skipped} frames"
        reporter.log(skip_msg)
        logger.info(skip_msg)
        logger.info("OCR pipeline completed successfully (%d cues).", len(items))
        return items
    finally:
        video.release()
