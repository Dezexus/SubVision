from collections.abc import Callable
from typing import Any

from .utils import is_similar

SubtitleItem = dict[str, Any]


class SubtitleEvent:
    """Represents a single subtitle event currently being tracked."""

    def __init__(self, text: str, start: float, conf: float) -> None:
        self.text: str = text
        self.start: float = start
        self.end: float = start
        self.max_conf: float = conf
        self.gap_frames: int = 0

    def extend(self, text: str, time: float, conf: float) -> None:
        """Updates the event with new frame data."""
        self.end = time
        self.gap_frames = 0
        if conf > self.max_conf or (conf == self.max_conf and len(text) > len(self.text)):
            self.text = text
            self.max_conf = conf


class SubtitleAggregator:
    """Manages merging continuous OCR results into discrete subtitle blocks."""

    def __init__(self, min_conf: float, gap_tolerance: int = 5) -> None:
        self.srt_data: list[SubtitleItem] = []
        self.active_event: SubtitleEvent | None = None
        self.min_conf: float = min_conf
        self.gap_tolerance: int = gap_tolerance
        self.on_new_subtitle: Callable[[SubtitleItem], None] | None = None

    def add_result(self, text: str, conf: float, timestamp: float) -> None:
        """Processes a new OCR result and updates the event state."""
        is_valid = bool(text and conf >= self.min_conf)

        if is_valid:
            if self.active_event:
                if is_similar(self.active_event.text, text, 0.6):
                    self.active_event.extend(text, timestamp, conf)
                else:
                    self._commit_event()
                    self.active_event = SubtitleEvent(text, timestamp, conf)
            else:
                self.active_event = SubtitleEvent(text, timestamp, conf)
        else:
            if self.active_event:
                self.active_event.gap_frames += 1
                if self.active_event.gap_frames > self.gap_tolerance:
                    self._commit_event()

    def _commit_event(self) -> None:
        """Commits the active event to the subtitle list."""
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
        """Flushes any remaining active event and returns the full dataset."""
        self._commit_event()
        return self.srt_data
