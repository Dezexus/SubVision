import numpy as np
import pytest

from subvision.processing.presets import resolve_config, get_preset_config
from subvision.processing.filters import ImagePipeline
from subvision.processing.aggregator import SubtitleAggregator, SubtitleEvent


def test_resolve_config_overrides():
    config = resolve_config(
        {
            "preset": "⚖️ Balance",
            "step": 3,
            "conf_threshold": 90,
            "smart_skip": False,
            "motion_mse_thresh": 25,
        }
    )
    assert config["step"] == 3
    assert config["min_conf"] == 90
    assert config["smart_skip"] is False
    assert config["motion_mse_thresh"] == 25.0


def test_balance_preset_defaults():
    config = get_preset_config("⚖️ Balance")
    assert config["step"] == 3
    assert config["gap_tolerance"] == 3
    assert config["motion_mse_thresh"] == 22.0


def test_legacy_mixed_alias_maps_to_balance():
    assert get_preset_config("🎬 Mixed") == get_preset_config("⚖️ Balance")


def test_image_pipeline_smart_skip_off():
    frame_a = np.zeros((40, 200, 3), dtype=np.uint8)
    frame_b = frame_a.copy()
    pipeline = ImagePipeline(
        roi=[0, 0, 0, 0],
        config={"smart_skip": False, "motion_mse_thresh": 15.0},
    )
    assert pipeline.check_motion(frame_a) is False
    assert pipeline.check_motion(frame_b) is False


def test_image_pipeline_crop_roi():
    frame = np.zeros((100, 200, 3), dtype=np.uint8)
    frame[80:95, 10:190] = 255
    pipeline = ImagePipeline(roi=[10, 80, 180, 15], config={"smart_skip": True})
    crop = pipeline.crop_roi(frame)
    assert crop is not None
    assert crop.shape[0] == 15
    assert crop.shape[1] == 180


def test_aggregator_majority_vote():
    event = SubtitleEvent("Helo world", 0.0, 1.0, 0.9)
    event.add_observation("Hello world", 0.95)
    event.add_observation("Hello world", 0.92)
    event.add_observation("Helo world", 0.88)
    text, conf = event.resolved_text_and_conf()
    assert text == "Hello world"
    assert conf == 0.95


def test_aggregator_min_event_duration_mixed():
    agg = SubtitleAggregator(min_conf=0.5, fps=24.0, min_event_frames_mult=1.5, step=1)
    agg.add_result("Hello", 0.99, 0.0)
    agg.add_result("Hello", 0.99, 0.08)
    agg.finalize()
    assert len(agg.srt_data) == 1


def test_aggregator_drops_flickering_short_text_keeps_real_short_cue():
    agg = SubtitleAggregator(min_conf=0.8, fps=30.0, step=3)
    agg.add_result("RA", 0.96, 1.0)
    for i in range(6):
        agg.add_result("", 0.0, 1.1 + i * 0.1)
    for i in range(8):
        agg.add_result("No", 0.99, 3.0 + i * 0.1)
    assert [item["text"] for item in agg.finalize()] == ["No"]


def test_aggregator_sample_duration_covers_step_window():
    """With step=5 @ 30fps, a single hit covers the full sample window after lead-in."""
    agg = SubtitleAggregator(min_conf=0.5, fps=30.0, min_event_frames_mult=1.0, step=5, abut_gap_max=0.08)
    agg.add_result("Hello", 0.99, 1.0)
    agg.finalize()
    assert len(agg.srt_data) == 1
    item = agg.srt_data[0]
    sd = 5 / 30
    assert item["start"] == pytest.approx(1.0 - 0.6 * sd, abs=1e-6)
    assert item["end"] == pytest.approx(1.0 + sd, abs=1e-6)


def test_aggregator_abuts_adjacent_different_cues():
    """Consecutive different lines on the next sample overlap after lead-in → snap."""
    fps = 30.0
    step = 5
    dt = step / fps
    agg = SubtitleAggregator(min_conf=0.5, fps=fps, min_event_frames_mult=1.0, step=step, abut_gap_max=0.08)
    agg.add_result("Hello there friend", 0.99, 0.0)
    agg.add_result("Hello there friend", 0.99, dt)
    agg.add_result("Completely different words", 0.99, 2 * dt)
    agg.add_result("Completely different words", 0.99, 3 * dt)
    agg.finalize()
    assert len(agg.srt_data) == 2
    assert agg.srt_data[0]["end"] == pytest.approx(agg.srt_data[1]["start"], abs=1e-6)


def test_aggregator_abuts_one_sample_residual_keeps_pauses():
    """~0.067s OCR residual snaps; ~0.1s+ pauses stay open."""
    sd = 5 / 30
    agg = SubtitleAggregator(min_conf=0.5, fps=30.0, step=5, abut_gap_max=0.08)
    # After lead_in, gap ≈ 0.067 (one sample residual)
    agg.srt_data = [
        {"id": 1, "start": 1.0, "end": 1.5, "text": "A", "conf": 0.9},
        {"id": 2, "start": 1.5 + sd, "end": 2.2, "text": "B", "conf": 0.9},
    ]
    agg._refine_timings()
    assert agg.srt_data[0]["end"] == pytest.approx(agg.srt_data[1]["start"], abs=1e-6)

    agg2 = SubtitleAggregator(min_conf=0.5, fps=30.0, step=5, abut_gap_max=0.08)
    agg2.srt_data = [
        {"id": 1, "start": 1.0, "end": 1.5, "text": "A", "conf": 0.9},
        {"id": 2, "start": 1.7, "end": 2.2, "text": "B", "conf": 0.9},
    ]
    agg2._refine_timings()
    # After lead_in (~0.1s) residual gap ≈ 0.1s — must NOT abut into the pause.
    assert agg2.srt_data[1]["start"] - agg2.srt_data[0]["end"] == pytest.approx(0.1, abs=0.02)



def test_smart_skip_reuses_result_without_ocr(monkeypatch):
    from subvision.processing.pipeline import run_ocr_pipeline

    class FakeVideo:
        def __init__(self, _path, step=1):
            self.width, self.height, self.fps = 100, 20, 1.0
            self.total_frames = 2

        def __iter__(self):
            frame = np.zeros((20, 100, 3), dtype=np.uint8)
            yield 0, 0.0, frame
            yield 1, 1.0, frame

        def release(self):
            return None

    class FakeEngine:
        calls = 0

        def predict_batch(self, frames):
            self.calls += 1
            return [[]]

    class Reporter:
        def set_total(self, total):
            pass

        def progress(self, *args):
            pass

        def log(self, *args):
            pass

        def subtitle(self, *args):
            pass

        def subtitles_replace(self, *args):
            pass

    class Cancellation:
        def is_cancelled_sync(self):
            return False

    engine = FakeEngine()
    monkeypatch.setattr("subvision.processing.pipeline.VideoProvider", FakeVideo)
    monkeypatch.setattr("subvision.processing.pipeline.get_paddle_engine", lambda **kwargs: engine)
    monkeypatch.setattr(
        "subvision.processing.pipeline.refine_subtitle_boundaries",
        lambda items, **kwargs: items,
    )

    result = run_ocr_pipeline(
        "unused.mp4",
        {"preset": "⚖️ Balance", "smart_skip": True, "denoise_strength": 0, "step": 1},
        Reporter(),
        Cancellation(),
    )

    assert result == []
    assert engine.calls == 1


def test_failed_inference_is_not_repeated_by_smart_skip(monkeypatch):
    from subvision.processing.pipeline import run_ocr_pipeline

    ok = [{"rec_texts": ["Hello there"], "rec_scores": [0.99], "rec_boxes": []}]
    results = [None, ok]

    class FakeVideo:
        def __init__(self, _path, step=1):
            self.width, self.height, self.fps = 100, 20, 10.0
            self.total_frames = 8

        def __iter__(self):
            frame = np.zeros((20, 100, 3), dtype=np.uint8)
            for i in range(self.total_frames):
                yield i, i / self.fps, frame

        def release(self):
            return None

    class FakeEngine:
        calls = 0

        def predict_batch(self, frames):
            self.calls += 1
            return [results[self.calls - 1]]

    class Quiet:
        def __getattr__(self, _name):
            return lambda *args, **kwargs: None

    class Cancellation:
        def is_cancelled_sync(self):
            return False

    engine = FakeEngine()
    monkeypatch.setattr("subvision.processing.pipeline.VideoProvider", FakeVideo)
    monkeypatch.setattr("subvision.processing.pipeline.get_paddle_engine", lambda **kwargs: engine)
    monkeypatch.setattr("subvision.processing.pipeline.refine_subtitle_boundaries", lambda items, **kwargs: items)

    items = run_ocr_pipeline(
        "unused.mp4",
        {"preset": "⚖️ Balance", "smart_skip": True, "denoise_strength": 0, "step": 1},
        Quiet(),
        Cancellation(),
    )

    # Frame 0 fails, so frame 1 must be re-OCRed rather than skipped as "no text".
    assert engine.calls == 2
    assert [item["text"] for item in items] == ["Hello there"]
    assert items[0]["end"] >= 0.7


def test_text_matches_cue_and_edge_search():
    from subvision.processing.edge_refine import (
        text_matches_cue,
        refine_edge_from_presence,
        collect_refine_frames,
        snap_abutting,
    )

    assert text_matches_cue("Hello world", "Hello world")
    assert text_matches_cue("Hello wrld", "Hello world")
    assert not text_matches_cue("", "Hello")
    assert not text_matches_cue("Completely different", "Hello world")

    # Presence: blank … text … blank; coarse start too early, coarse end too late
    presence = {i: False for i in range(0, 20)}
    for i in range(5, 12):
        presence[i] = True
    assert refine_edge_from_presence(presence, 3, window_frames=5, total_frames=20, find_start=True) == 5
    assert refine_edge_from_presence(presence, 14, window_frames=5, total_frames=20, find_start=False) == 11

    frames = collect_refine_frames(
        [{"start": 1.0, "end": 2.0, "text": "A"}],
        fps=10.0,
        total_frames=100,
        window_frames=2,
    )
    assert 8 in frames and 10 in frames and 20 in frames and 22 in frames

    items = [
        {"id": 1, "start": 1.0, "end": 1.5, "text": "A", "conf": 1.0},
        {"id": 2, "start": 1.55, "end": 2.0, "text": "B", "conf": 1.0},
    ]
    snap_abutting(items, abut_gap_max=0.08)
    assert items[0]["end"] == pytest.approx(items[1]["start"])
