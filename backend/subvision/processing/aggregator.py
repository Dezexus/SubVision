from collections import Counter
from collections.abc import Callable
from typing import Any

from subvision.processing.text_utils import is_similar, SUBTITLE_SIMILARITY_THRESH, normalize_text

SubtitleItem = dict[str, Any]


class SubtitleEvent:
    """Represents a tracked subtitle event."""

    def __init__(self, text: str, start: float, end: float, conf: float) -> None:
        self.text: str = text
        self.start: float = start
        self.end: float = end
        self.max_conf: float = conf
        self.gap_frames: int = 0
        self.observations: list[tuple[str, float]] = [(text, conf)]

    def add_observation(self, text: str, conf: float) -> None:
        norm = normalize_text(text)
        if norm:
            self.observations.append((norm, conf))

    def extend(self, text: str, end: float, conf: float) -> None:
        """Update end time and collect OCR observations."""
        self.end = end
        self.gap_frames = 0
        self.add_observation(text, conf)
        norm = normalize_text(text)
        if len(norm) > len(self.text) or (len(norm) == len(self.text) and conf > self.max_conf):
            self.text = norm
            self.max_conf = conf

    def resolved_text_and_conf(self) -> tuple[str, float]:
        """Pick text by majority vote; tie-break by confidence then length."""
        if not self.observations:
            return self.text, self.max_conf

        counts = Counter(obs[0] for obs in self.observations)
        max_count = max(counts.values())
        candidates = [t for t, c in counts.items() if c == max_count]

        def score(t: str) -> tuple[float, float, int]:
            confs = [conf for obs_t, conf in self.observations if obs_t == t]
            return (max(confs), sum(confs) / len(confs), len(t))

        best = max(candidates, key=score)
        confs = [conf for obs_t, conf in self.observations if obs_t == best]
        return best, max(confs)


class SubtitleAggregator:
    """Aggregates and filters OCR subtitle frames into distinct events."""

    def __init__(
        self,
        min_conf: float,
        gap_tolerance: int = 5,
        fps: float = 25.0,
        min_event_frames_mult: float = 2.0,
        step: int = 1,
        abut_gap_max: float = 0.08,
    ) -> None:
        self.srt_data: list[SubtitleItem] = []
        self.active_event: SubtitleEvent | None = None
        self.min_conf: float = min_conf
        self.gap_tolerance: int = gap_tolerance
        self.min_event_frames_mult: float = min_event_frames_mult
        self.on_new_subtitle: Callable[[SubtitleItem], None] | None = None

        fps = fps if fps > 0 else 25.0
        step = max(1, int(step))
        self.frame_duration = 1.0 / fps
        # OCR samples every ``step`` frames — cover the full sample window on end.
        # lead_in fixes late first-hit; abut snaps ~1-sample residual (~0.067s @ step5/30fps)
        # without swallowing real pauses (>= ~0.1s).
        self.sample_duration = step * self.frame_duration
        self.end_fill = self.sample_duration
        self.lead_in = 0.6 * self.sample_duration
        self.lead_out = 0.0
        self.abut_gap_max = float(abut_gap_max)

    def add_result(self, text: str, conf: float, timestamp: float) -> None:
        """Process a new OCR result."""
        norm_text = normalize_text(text)

        is_valid = False
        if norm_text:
            required_conf = 0.95 if len(norm_text) < 3 else self.min_conf
            is_valid = conf >= required_conf

        # Cover the full sample window so consecutive cues meet after lead-in.
        frame_end_time = timestamp + self.end_fill

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
            min_duration = self.frame_duration * self.min_event_frames_mult
            if self.active_event.end - self.active_event.start >= min_duration:
                text, conf = self.active_event.resolved_text_and_conf()
                item: SubtitleItem = {
                    "id": len(self.srt_data) + 1,
                    "start": self.active_event.start,
                    "end": self.active_event.end,
                    "text": text,
                    "conf": conf,
                }
                self.srt_data.append(item)
                if self.on_new_subtitle:
                    self.on_new_subtitle(item)
            self.active_event = None

    def finalize(self) -> list[SubtitleItem]:
        """Process remaining events and apply post-processing like merging."""
        self._commit_event()
        self._merge_adjacent_events()
        self._refine_timings()
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
            text_match = (
                is_similar(prev["text"], curr["text"], 0.75)
                or curr["text"] in prev["text"]
                or prev["text"] in curr["text"]
            )

            if time_gap <= 0.5 and text_match:
                prev["end"] = curr["end"]
                if len(curr["text"]) > len(prev["text"]):
                    prev["text"] = curr["text"]
            else:
                curr["id"] = len(merged) + 1
                merged.append(curr)

        self.srt_data = merged

    def _refine_timings(self) -> None:
        """Pad for OCR sample quantization and snap near-adjacent cues together."""
        if not self.srt_data:
            return

        for item in self.srt_data:
            item["start"] = max(0.0, float(item["start"]) - self.lead_in)
            item["end"] = float(item["end"]) + self.lead_out

        for i in range(1, len(self.srt_data)):
            prev = self.srt_data[i - 1]
            curr = self.srt_data[i]
            gap = float(curr["start"]) - float(prev["end"])

            if gap < 0:
                # Pads overlapped — split at midpoint of the overlap.
                boundary = (float(prev["end"]) + float(curr["start"])) / 2.0
                prev["end"] = boundary
                curr["start"] = boundary
            elif gap <= self.abut_gap_max:
                # Continuous dialogue: ideal-style abutting cues.
                prev["end"] = curr["start"]

        for item in self.srt_data:
            if float(item["end"]) <= float(item["start"]):
                item["end"] = float(item["start"]) + self.sample_duration
