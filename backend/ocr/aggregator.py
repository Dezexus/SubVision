"""
This module defines classes for tracking and aggregating OCR results
into coherent subtitle blocks based on text similarity and timing.
"""
from collections.abc import Callable
from typing import Any
from core.utils import is_similar
from core.constants import SUBTITLE_SIMILARITY_THRESH

SubtitleItem = dict[str, Any]

class SubtitleEvent:
    """
    Represents a single, continuous subtitle event being tracked over several frames.
    """

    def __init__(self, text: str, start: float, end: float, conf: float) -> None:
        self.text: str = text
        self.start: float = start
        self.end: float = end
        self.max_conf: float = conf

    def extend(self, text: str, end: float, conf: float) -> None:
        self.end = end
        if conf > self.max_conf or (conf == self.max_conf and len(text) > len(self.text)):
            self.text = text
            self.max_conf = conf

class SubtitleAggregator:
    """
    Manages the process of merging continuous OCR results from video frames
    into discrete, logical subtitle blocks.
    """

    def __init__(self, min_conf: float, max_gap_seconds: float = 0.2, fps: float = 25.0) -> None:
        self.srt_data: list[SubtitleItem] = []
        self.active_event: SubtitleEvent | None = None
        self.min_conf: float = min_conf
        self.max_gap_seconds = max_gap_seconds
        self.on_new_subtitle: Callable[[SubtitleItem], None] | None = None
        self.fps = fps

    def add_result(self, text: str, conf: float, timestamp: float) -> None:
        """
        Processes a new OCR result from a frame.
        """
        if text and conf >= self.min_conf:
            if self.active_event:
                if is_similar(self.active_event.text, text, SUBTITLE_SIMILARITY_THRESH):
                    self.active_event.extend(text, timestamp, conf)
                else:
                    self._commit_event()
                    self.active_event = SubtitleEvent(text, timestamp, timestamp, conf)
            else:
                self.active_event = SubtitleEvent(text, timestamp, timestamp, conf)
        else:
            if self.active_event and timestamp - self.active_event.end > self.max_gap_seconds:
                self._commit_event()

    def handle_skipped(self, timestamp: float) -> None:
        """
        Extend active subtitle end time when frames are skipped without OCR.
        """
        if self.active_event:
            self.active_event.end = timestamp

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