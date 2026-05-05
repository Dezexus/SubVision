from collections.abc import Callable
from typing import Any
from processing.text_utils import is_similar, SUBTITLE_SIMILARITY_THRESH

SubtitleItem = dict[str, Any]

class SubtitleEvent:
    def __init__(self, text: str, start: float, end: float, conf: float) -> None:
        self.text: str = text
        self.start: float = start
        self.end: float = end
        self.max_conf: float = conf
        self.gap_frames: int = 0

    def extend(self, text: str, end: float, conf: float) -> None:
        self.end = end
        self.gap_frames = 0
        if conf > self.max_conf or (conf == self.max_conf and len(text) > len(self.text)):
            self.text = text
            self.max_conf = conf

class SubtitleAggregator:
    def __init__(self, min_conf: float, gap_tolerance: int = 5, fps: float = 25.0) -> None:
        self.srt_data: list[SubtitleItem] = []
        self.active_event: SubtitleEvent | None = None
        self.min_conf: float = min_conf
        self.gap_tolerance: int = gap_tolerance
        self.on_new_subtitle: Callable[[SubtitleItem], None] | None = None
        self.frame_duration = 1.0 / fps if fps > 0 else 0.04

    def add_result(self, text: str, conf: float, timestamp: float) -> None:
        is_valid = bool(text and conf >= self.min_conf)
        frame_end_time = timestamp + self.frame_duration

        if is_valid:
            if self.active_event:
                if is_similar(self.active_event.text, text, SUBTITLE_SIMILARITY_THRESH):
                    self.active_event.extend(text, frame_end_time, conf)
                else:
                    self._commit_event()
                    self.active_event = SubtitleEvent(text, timestamp, frame_end_time, conf)
            else:
                self.active_event = SubtitleEvent(text, timestamp, frame_end_time, conf)
        else:
            if self.active_event:
                self.active_event.gap_frames += 1
                if self.active_event.gap_frames > self.gap_tolerance:
                    self._commit_event()

    def _commit_event(self) -> None:
        if self.active_event:
            item: SubtitleItem = {
                "id": len(self.srt_data) + 1,
                "start": self.active_event.start,
                "end": self.active_event.end,
                "text": self.active_event.text,
                "conf": self.active_event.max_conf,
            }
            self.srt_data.append(item)
            if self.on_new_subtitle:
                self.on_new_subtitle(item)
            self.active_event = None

    def finalize(self) -> list[SubtitleItem]:
        self._commit_event()
        return self.srt_data