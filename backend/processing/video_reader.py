from collections.abc import Iterator
from typing import Any
import logging

from core.video_io import get_video_metadata, iter_frames_ffmpeg

logger = logging.getLogger(__name__)

class VideoProvider:
    def __init__(self, video_path: str, step: int = 1, use_hwaccel: bool = True) -> None:
        self.video_path = video_path
        self.step = step
        self.use_hwaccel = use_hwaccel

        meta = get_video_metadata(video_path)
        self.width = meta["width"]
        self.height = meta["height"]
        self.fps = meta["fps"]
        self.total_frames = meta["total_frames"]

        logger.info("Video %s: %dx%d, %.2f fps, %d frames",
                     video_path, self.width, self.height, self.fps, self.total_frames)

    def __iter__(self) -> Iterator[tuple[int, float, Any]]:
        yield from iter_frames_ffmpeg(
            video_path=self.video_path,
            step=self.step,
            fps=self.fps,
            total=self.total_frames,
            width=self.width,
            height=self.height,
            use_hwaccel=self.use_hwaccel
        )

    def release(self) -> None:
        pass