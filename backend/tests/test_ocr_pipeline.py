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


def test_mixed_preset_defaults():
    config = get_preset_config("🎬 Mixed")
    assert config["step"] == 3
    assert config["gap_tolerance"] == 3
    assert config["motion_mse_thresh"] == 22.0


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
    agg.add_result("Hi", 0.99, 0.0)
    agg.add_result("Hi", 0.99, 0.08)
    agg.finalize()
    assert len(agg.srt_data) == 1


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



def test_forced_ocr_runs_when_motion_skipped():
    """When ROI is unchanged, forced OCR still invokes the engine if crop is valid."""
    calls: list[bool] = []

    class FakeEngine:
        def predict_batch(self, frames, use_det=True):
            calls.append(use_det)
            return [None]

    pipeline_cfg = {"smart_skip": True, "denoise_strength": 0, "scale_factor": 1.0, "motion_mse_thresh": 15.0}
    pipeline = ImagePipeline(roi=[0, 0, 0, 0], config=pipeline_cfg)
    frame = np.zeros((20, 100, 3), dtype=np.uint8)

    pipeline.check_motion(frame)
    motion_skipped = pipeline.check_motion(frame)
    assert motion_skipped is True

    final_img = pipeline.apply_filters_to_roi(frame)
    assert final_img is not None

    engine = FakeEngine()
    engine.predict_batch([final_img], use_det=True)
    assert len(calls) == 1


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
