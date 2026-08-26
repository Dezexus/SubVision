import asyncio
import logging
import os
import tempfile
import time
from typing import List, Optional

from subvision.rendering.interfaces import Reporter, Storage, CancellationToken
from subvision.rendering.models import RenderTaskConfig
from subvision.rendering.effects.interface import Effect
from subvision.rendering.video_writer import AsyncVideoWriter
from subvision.rendering.transcoder import FFmpegTranscoder
from subvision.core.exceptions import TaskCancelledError
from subvision.core.gpu_utils import release_paddle_gpu_memory
from subvision.core.video_io import get_video_dar, get_video_metadata, iter_frames

logger = logging.getLogger(__name__)

# Share of the progress bar reserved for ProPainter prepare() (segment inference).
_PROPAINTER_PREPARE_SHARE = 0.8


class _PhasedProgress:
    """Map prepare + encode onto a single 0..total_frames progress scale."""

    def __init__(
        self,
        reporter: Reporter,
        total_frames: int,
        prepare_share: float = _PROPAINTER_PREPARE_SHARE,
    ) -> None:
        self.reporter = reporter
        self.total = max(total_frames, 1)
        self.prepare_end = max(1, int(self.total * prepare_share))
        self.encode_span = max(1, self.total - self.prepare_end)

    def prepare(self, current: int, total: int, eta: str) -> None:
        total = max(total, 1)
        cur = int(self.prepare_end * min(current, total) / total)
        self.reporter.progress(cur, self.total, eta)

    def encode(self, frame_idx: int, frame_total: int, eta: str) -> None:
        frame_total = max(frame_total, 1)
        cur = self.prepare_end + int(self.encode_span * min(frame_idx, frame_total) / frame_total)
        self.reporter.progress(min(cur, self.total), self.total, eta)


def _process_frames_sync(
    local_video_path: str,
    total_frames: int,
    fps: float,
    width: int,
    height: int,
    effects: List[Effect],
    writer: AsyncVideoWriter,
    reporter: Reporter,
    cancellation: CancellationToken,
    phased: Optional[_PhasedProgress] = None,
) -> int:
    frame_idx = 0
    t0 = time.time()
    if phased is None:
        reporter.progress(0, total_frames, "...")
    else:
        phased.encode(0, total_frames, "...")

    for f_idx, _, frame in iter_frames(
        local_video_path,
        step=1,
        fps=fps,
        total=total_frames,
        width=width,
        height=height,
        use_hwaccel=True,
    ):
        if cancellation.is_cancelled_sync():
            raise TaskCancelledError("User cancelled during frame writing")

        for effect in effects:
            frame = effect.apply(frame, f_idx)

        writer.write(frame)
        frame_idx += 1

        progress_total = max(total_frames, frame_idx)
        if frame_idx == 1 or frame_idx % 10 == 0:
            elapsed = max(time.time() - t0, 1e-3)
            fps_done = frame_idx / elapsed
            remaining = max(0, progress_total - frame_idx)
            eta_sec = int(remaining / fps_done) if fps_done > 0 else 0
            eta = f"{eta_sec // 60:02d}:{eta_sec % 60:02d}"
            if phased is None:
                reporter.progress(frame_idx, progress_total, eta)
            else:
                phased.encode(frame_idx, progress_total, eta)
            if frame_idx == 1 or frame_idx % 100 == 0:
                logger.info(
                    "Render progress: %d/%d (%.1f fps, ETA %s)",
                    frame_idx,
                    progress_total,
                    fps_done,
                    eta,
                )

    done_total = max(frame_idx, 1)
    if phased is None:
        reporter.progress(done_total, done_total, "00:00")
    else:
        phased.encode(done_total, done_total, "00:00")
    reporter.done(done_total if phased is None else phased.total)
    return frame_idx


async def render_blur_pipeline(
    task_config: RenderTaskConfig,
    storage: Storage,
    reporter: Reporter,
    cancellation: CancellationToken,
) -> str:
    filename = task_config.filename
    safe_filename = os.path.basename(filename)
    output_filename = f"blurred_{safe_filename}"

    overall_start = time.time()

    await asyncio.to_thread(release_paddle_gpu_memory)

    with tempfile.TemporaryDirectory() as tmpdir:
        local_video_path = os.path.join(tmpdir, safe_filename)
        temp_render_path = os.path.join(tmpdir, "temp_" + output_filename)
        final_output_path = os.path.join(tmpdir, output_filename)

        reporter.log("Downloading video from storage...")
        dl_start = time.time()
        dl_ok = await storage.copy_from(safe_filename, local_video_path)
        dl_time = time.time() - dl_start
        logger.info(f"Video download completed in {dl_time:.2f} seconds")

        if not dl_ok:
            raise FileNotFoundError(f"Source video file '{safe_filename}' not found in storage.")

        if cancellation.is_cancelled_sync():
            raise TaskCancelledError("User cancelled before processing")

        meta = await asyncio.to_thread(get_video_metadata, local_video_path)
        dar = await asyncio.to_thread(get_video_dar, local_video_path)
        width = meta["width"]
        height = meta["height"]
        fps = meta["fps"]
        total_frames = meta["total_frames"]

        effects: List[Effect] = task_config.build_effects()
        mode = task_config.blur_settings.mode
        phased: Optional[_PhasedProgress] = None
        if mode == "propainter":
            phased = _PhasedProgress(reporter, total_frames)
            reporter.log("ProPainter: preparing segments (GPU inpainting)...")
            for effect in effects:
                set_cb = getattr(effect, "set_prepare_progress", None)
                if callable(set_cb):

                    def _on_prepare(cur: int, tot: int, eta: str, _phased=phased) -> None:
                        _phased.prepare(cur, tot, eta)
                        # propainter reports centi-units (window + frac)*100
                        if cur > 0 and (cur % 100 == 0 or cur == tot):
                            reporter.log(f"ProPainter window {max(1, cur // 100)}/{max(1, tot // 100)}")

                    set_cb(_on_prepare)

        for effect in effects:
            await effect.prepare(
                subtitles=task_config.subtitles,
                width=width,
                height=height,
                fps=fps,
                total_frames=total_frames,
                video_path=local_video_path,
            )

        if mode == "propainter":
            reporter.log("ProPainter: encoding frames...")

        writer = AsyncVideoWriter(
            temp_render_path, fps, (width, height), task_config.blur_settings.encoder
        )

        try:
            frame_idx = await asyncio.to_thread(
                _process_frames_sync,
                local_video_path,
                total_frames,
                fps,
                width,
                height,
                effects,
                writer,
                reporter,
                cancellation,
                phased,
            )
        finally:
            await asyncio.to_thread(writer.close)

        logger.info(f"Frame writing completed ({frame_idx} frames)")

        if cancellation.is_cancelled_sync():
            raise TaskCancelledError("User cancelled after writing")

        done_total = max(frame_idx, 1)
        reporter.progress(done_total, done_total, "00:00")
        reporter.log("Muxing audio and restoring aspect ratio...")
        await FFmpegTranscoder.transcode_with_audio(
            temp_video=temp_render_path,
            original_video=local_video_path,
            output_path=final_output_path,
            dar=dar,
            encoder=task_config.blur_settings.encoder,
            cancel=cancellation,
        )

        reporter.progress(done_total, done_total, "00:00")
        reporter.log("Uploading result...")
        up_ok = await storage.copy_to(final_output_path, output_filename)
        if not up_ok:
            raise RuntimeError("Failed to upload the final rendered video to storage.")

        reporter.progress(done_total, done_total, "00:00")
        total_elapsed = time.time() - overall_start
        logger.info(f"Total render time: {total_elapsed:.2f} seconds")

        return output_filename
