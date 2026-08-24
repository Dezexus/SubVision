import numpy as np

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
    agg = SubtitleAggregator(min_conf=0.5, fps=24.0, min_event_frames_mult=1.5)
    agg.add_result("Hi", 0.99, 0.0)
    agg.add_result("Hi", 0.99, 0.08)
    agg.finalize()
    assert len(agg.srt_data) == 1


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
