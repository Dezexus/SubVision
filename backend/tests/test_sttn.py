"""Tests for the STTN subtitle removal mode. The model itself needs torch and a GPU image."""

import cv2
import numpy as np
import pytest

from subvision.domain.models import BlurSettings
from subvision.rendering.effects import sttn
from subvision.rendering.effects.inpainting import cue_mask_samples, cue_text_mask, generate_text_mask, hybrid_blend_alpha
from subvision.rendering.effects.sttn import MODEL_HEIGHT, MODEL_WIDTH, STTNEffect, StripModel, strip_region
from subvision.rendering.models import RenderTaskConfig

W, H, FONT = 2340, 1080, 34
ROI = (700, 980, 900, 57)


def _frames(count: int) -> list[np.ndarray]:
    base = np.full((H, W, 3), 60, dtype=np.uint8)
    cv2.putText(base, "Subtitle text", (1060, 1020), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
    return [base.copy() for _ in range(count)]


def _effect(monkeypatch, frames: list[np.ndarray], paint) -> STTNEffect:
    monkeypatch.setattr(sttn, "iter_frames_range", lambda p, a, b, **k: ((i, frames[i]) for i in range(a, min(b, len(frames)))))
    monkeypatch.setattr(sttn, "run_model", paint)
    effect = STTNEffect({"y": 1036, "font_size": FONT, "sigma": 5, "height_multiplier": 1.5})
    effect.index_cues([{"text": "Subtitle text", "start": 0.0, "end": 1.0}], W, H, 30.0, len(frames), "video.mp4")
    return effect


def test_build_effects_sttn_mode_does_not_need_torch():
    config = RenderTaskConfig(
        filename="v.mp4",
        client_id="c1",
        subtitles=[{"id": 1, "text": "Hello", "start": 0.0, "end": 1.0}],
        blur_settings=BlurSettings(mode="sttn"),
    )
    assert [e.__class__.__name__ for e in config.build_effects()] == ["STTNEffect"]


def test_strip_keeps_model_aspect_and_covers_the_text():
    x, y, w, h = strip_region(ROI, (H, W, 3), FONT)

    assert abs(w / h - MODEL_WIDTH / MODEL_HEIGHT) < 0.05
    assert x <= ROI[0] and x + w >= ROI[0] + ROI[2]
    assert y <= ROI[1] and y + h >= ROI[1] + ROI[3]
    assert y + h <= H


def test_strip_width_follows_the_font_so_letters_reach_the_model_at_a_trained_size():
    assert strip_region((1100, 980, 140, 57), (H, W, 3), FONT)[2] == int(FONT * sttn.STRIP_WIDTH_FONTS)


def test_strip_grows_past_the_font_rule_for_very_long_text():
    assert strip_region((100, 980, 2000, 57), (H, W, 3), FONT)[2] == 2000 + 2 * FONT


def test_strip_fits_a_frame_narrower_than_the_model():
    x, y, w, h = strip_region((10, 150, 200, 40), (240, 320, 3), 20)

    assert x == 0 and w == 320
    assert y + h <= 240


def test_changes_exactly_the_area_hybrid_changes(monkeypatch):
    frames = _frames(32)
    effect = _effect(monkeypatch, frames, lambda strips: [np.full_like(s, 200) for s in strips])
    cue = effect.frame_cues[10][0]

    result = effect.apply(frames[10].copy(), 10)
    changed = np.any(result != frames[10], axis=2)

    samples = [generate_text_mask(frames[i], cue.roi, FONT) for i in cue_mask_samples(cue.start_f, cue.end_f)]
    work_roi, work_mask = cue_text_mask(samples, cue.roi, max(2, int(FONT * 0.2)))
    (hx, hy, hw, hh), alpha = hybrid_blend_alpha(frames[10].shape, work_roi, FONT, work_mask)
    hybrid_area = np.zeros(changed.shape, dtype=bool)
    hybrid_area[hy : hy + hh, hx : hx + hw] = alpha > 0.01

    assert isinstance(next(iter(effect._models.values())), StripModel)
    assert changed.any()
    assert not (changed[:hy].any() or changed[hy + hh :].any() or changed[:, :hx].any() or changed[:, hx + hw :].any())
    assert changed[hybrid_area].mean() > 0.9


def test_each_frame_gets_its_own_fill(monkeypatch):
    frames = _frames(32)

    def paint(strips):
        return [np.full_like(s, i * 4) for i, s in enumerate(strips)]

    effect = _effect(monkeypatch, frames, paint)
    model = effect._model(effect.frame_cues[5][0], frames[0].shape)

    assert model.fills[5].mean() != model.fills[20].mean()


def test_long_cue_is_split_into_passes(monkeypatch):
    frames = _frames(32)
    sizes = []

    def paint(strips):
        sizes.append(len(strips))
        return [np.full_like(s, 60) for s in strips]

    monkeypatch.setattr(sttn, "MAX_FRAMES_PER_PASS", 10)
    effect = _effect(monkeypatch, frames, paint)
    effect._model(effect.frame_cues[5][0], frames[0].shape)

    assert sum(sizes) == 31 and max(sizes) == 10


def test_cue_without_detectable_text_still_gets_hybrids_band(monkeypatch):
    flat = [np.full((H, W, 3), 60, dtype=np.uint8) for _ in range(32)]
    effect = _effect(monkeypatch, flat, lambda strips: [np.full_like(s, 200) for s in strips])

    result = effect.apply(flat[5].copy(), 5)

    assert isinstance(next(iter(effect._models.values())), StripModel)
    assert np.any(result != flat[5])


def test_tampered_weights_are_rejected(monkeypatch, tmp_path):
    target = tmp_path / "infer_model.pth"
    monkeypatch.setattr(sttn, "weights_path", lambda: target)
    monkeypatch.setattr(sttn.urllib.request, "urlretrieve", lambda url, dest: dest.write_bytes(b"not the real file"))

    with pytest.raises(RuntimeError, match="hash check"):
        sttn.ensure_weights()
    assert not target.exists()


def test_generator_matches_the_published_weights():
    torch = pytest.importorskip("torch")
    from subvision.rendering.effects.sttn_network import InpaintGenerator

    generator = InpaintGenerator()
    with torch.no_grad():
        feats = generator.encoder(torch.zeros(2, 3, MODEL_HEIGHT, MODEL_WIDTH))
        out = generator.decoder(generator.transformer(feats))

    assert out.shape == (2, 3, MODEL_HEIGHT, MODEL_WIDTH)

