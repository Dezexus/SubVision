from collections.abc import Callable
from typing import Any
from processing.text_utils import is_similar, SUBTITLE_SIMILARITY_THRESH, normalize_text

SubtitleItem = dict[str, Any]

class SubtitleEvent:
    """Represents a tracked subtitle event."""
    def __init__(self, text: str, start: float, end: float, conf: float) -> None:
        self.text: str = text
        self.start: float = start
        self.end: float = end
        self.max_conf: float = conf
        self.gap_frames: int = 0

    def extend(self, text: str, end: float, conf: float) -> None:
        """Update end time and retain the most accurate text representation."""
        self.end = end
        self.gap_frames = 0
        if len(text) > len(self.text) or (len(text) == len(self.text) and conf > self.max_conf):
            self.text = text
            self.max_conf = conf

class SubtitleAggregator:
    """Aggregates and filters OCR subtitle frames into distinct events."""
    def __init__(self, min_conf: float, gap_tolerance: int = 5, fps: float = 25.0) -> None:
        self.srt_data: list[SubtitleItem] = []
        self.active_event: SubtitleEvent | None = None
        self.min_conf: float = min_conf
        self.gap_tolerance: int = gap_tolerance
        self.on_new_subtitle: Callable[[SubtitleItem], None] | None = None
        self.frame_duration = 1.0 / fps if fps > 0 else 0.04

    def add_result(self, text: str, conf: float, timestamp: float) -> None:
        """Process a new OCR result."""
        norm_text = normalize_text(text)
        
        is_valid = False
        if norm_text:
            required_conf = 0.95 if len(norm_text) < 3 else self.min_conf
            is_valid = conf >= required_conf

        frame_end_time = timestamp + self.frame_duration

        if is_valid:
            if self.active_event:
                if is_similar(self.active_event.text, norm_text, SUBTITLE_SIMILARITY_THRESH) or norm_text in self.active_event.text or self.active_event.text in norm_text:
                    self.active_event.extend(norm_text, frame_end_time, conf)
                else:
                    self._commit_event()
                    self.active_event = SubtitleEvent(norm_text, timestamp, frame_end_time, conf)
            else:
                self.active_event = SubtitleEvent(norm_text, timestamp, frame_end_time, conf)
        else:
            if self.active_event:
                self.active_event.gap_frames += 1
                if self.active_event.gap_frames > self.gap_tolerance:
                    self._commit_event()

    def _commit_event(self) -> None:
        """Finalize the current active event and add it to the dataset."""
        if self.active_event:
            if self.active_event.end - self.active_event.start >= self.frame_duration * 2:
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
        """Process remaining events and apply post-processing like merging."""
        self._commit_event()
        self._merge_adjacent_events()
        return self.srt_data

    def _merge_adjacent_events(self) -> None:
        """Merge adjacent duplicate subtitles to fix fragmentation."""
        if not self.srt_data:
            return
        
        merged = [self.srt_data[0]]
        for i in range(1, len(self.srt_data)):
            curr = self.srt_data[i]
            prev = merged[-1]
            
            time_gap = curr["start"] - prev["end"]
            text_match = is_similar(prev["text"], curr["text"], 0.8) or curr["text"] in prev["text"] or prev["text"] in curr["text"]
            
            if time_gap <= 0.6 and text_match:
                prev["end"] = curr["end"]
                if len(curr["text"]) > len(prev["text"]):
                    prev["text"] = curr["text"]
            else:
                curr["id"] = len(merged) + 1
                merged.append(curr)
                
        self.srt_data = merged