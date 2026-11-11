"""Several subtitle regions, each written to its own track."""

import numpy as np

from subvision.domain.models import BlurSettings
from subvision.processing.edge_refine import snap_abutting_by_track
from subvision.processing.pipeline import merge_tracks, resolve_rois
from subvision.rendering.models import RenderTaskConfig


def test_resolve_rois_prefers_list_and_caps_count():
    assert resolve_rois({"roi": [1, 2, 3, 4]}) == [[1, 2, 3, 4]]
    assert resolve_rois({"roi": [1, 2, 3, 4], "rois": [[5, 6, 7, 8]]}) == [[5, 6, 7, 8]]
    assert len(resolve_rois({"rois": [[0, 0, 1, 1]] * 5})) == 3
    assert resolve_rois({}) == [[0, 0, 0, 0]]


def test_merge_tracks_tags_sorts_and_renumbers():
    merged = merge_tracks(
        [
            [{"id": 1, "start": 2.0, "end": 3.0, "text": "bottom"}],
            [{"id": 1, "start": 1.0, "end": 4.0, "text": "top"}],
        ]
    )
    assert [(m["text"], m["track"], m["id"]) for m in merged] == [("top", 1, 1), ("bottom", 0, 2)]


def test_snap_abutting_ignores_overlaps_across_tracks():
    items = [
        {"start": 1.0, "end": 3.0, "text": "a", "track": 0},
        {"start": 2.0, "end": 4.0, "text": "b", "track": 1},
    ]
    snap_abutting_by_track(items)
    assert items[0]["end"] == 3.0
    assert items[1]["start"] == 2.0


def test_ocr_pipeline_writes_each_region_to_its_track(monkeypatch):
    from subvision.processing.pipeline import run_ocr_pipeline

    class FakeVideo:
        def __init__(self, _path, step=1):
            self.width, self.height, self.fps = 100, 100, 10.0
            self.total_frames = 10

        def __iter__(self):
            for i in range(self.total_frames):
                # Vary pixels so smart skip never reuses a result.
                yield i, i / self.fps, np.full((100, 100, 3), i * 20, dtype=np.uint8)

        def release(self):
            return None

    class FakeEngine:
        def __init__(self):
            self.batch_sizes = []

        def predict_batch(self, frames):
            self.batch_sizes.append(len(frames))
            # The bottom ROI is 60 px wide, the top one 40 px.
            return [[{"rec_texts": ["Bottom line" if f.shape[1] == 60 else "Top sign"], "rec_scores": [0.99], "rec_boxes": []}] for f in frames]

    live = []

    class Reporter:
        def __getattr__(self, _name):
            return lambda *args, **kwargs: None

        def subtitle(self, item):
            live.append(item)

    class Cancellation:
        def is_cancelled_sync(self):
            return False

    engine = FakeEngine()
    monkeypatch.setattr("subvision.processing.pipeline.VideoProvider", FakeVideo)
    monkeypatch.setattr("subvision.processing.pipeline.get_paddle_engine", lambda **kwargs: engine)
    monkeypatch.setattr("subvision.processing.pipeline.refine_subtitle_boundaries", lambda items, **kwargs: items)

    items = run_ocr_pipeline(
        "unused.mp4",
        {
            "preset": "⚖️ Balance",
            "smart_skip": False,
            "denoise_strength": 0,
            "step": 1,
            # The third region is unset and must not OCR the whole frame.
            "rois": [[20, 80, 60, 15], [30, 5, 40, 15], [0, 0, 0, 0]],
        },
        Reporter(),
        Cancellation(),
    )

    assert {(it["text"], it["track"]) for it in items} == {("Bottom line", 0), ("Top sign", 1)}
    assert sorted(it["id"] for it in items) == list(range(1, len(items) + 1))
    # Both regions of a frame go to the engine together.
    assert set(engine.batch_sizes) == {2}
    assert len({it["id"] for it in live}) == len(live)


def test_render_builds_one_effect_per_track_with_its_subtitles():
    config = RenderTaskConfig(
        filename="v.mp4",
        client_id="c",
        blur_settings=BlurSettings(mode="hybrid"),
        track_blur_settings=[BlurSettings(mode="hybrid", y=900), BlurSettings(mode="blur", y=120)],
        subtitles=[
            {"start": 0, "end": 1, "text": "bottom", "track": 0},
            {"start": 0, "end": 1, "text": "top", "track": 1},
            {"start": 2, "end": 3, "text": "legacy"},
        ],
    )
    pairs = config.build_track_effects()
    assert [(e.__class__.__name__, [s["text"] for s in subs]) for e, subs in pairs] == [
        ("InpaintEffect", ["bottom", "legacy"]),
        ("BlurEffect", ["top"]),
    ]
    assert pairs[1][0].blur_settings["y"] == 120


def test_render_track_without_settings_falls_back_to_blur_settings():
    config = RenderTaskConfig(
        filename="v.mp4",
        client_id="c",
        blur_settings=BlurSettings(mode="blur", y=500),
        subtitles=[{"start": 0, "end": 1, "text": "x", "track": 2}],
    )
    ((effect, _subs),) = config.build_track_effects()
    assert effect.blur_settings["y"] == 500


def test_blur_preview_applies_each_cue_with_its_own_settings(monkeypatch):
    from subvision.rendering import blur_preview

    rng = np.random.default_rng(0)
    frame = rng.integers(0, 255, size=(200, 300, 3), dtype=np.uint8)
    monkeypatch.setattr(blur_preview, "extract_frame_cv2", lambda *_args: (frame, None))

    base = BlurSettings(mode="blur", font_size=20, sigma=8, feather=0).model_dump()
    out = blur_preview.generate_blur_preview(
        "unused.mp4",
        0,
        base,
        cues=[("bottom text", {**base, "y": 190}), ("top text", {**base, "y": 50})],
    )

    def changed(y0, y1):
        return not np.array_equal(out[y0:y1], frame[y0:y1])

    assert changed(160, 190)  # bottom cue
    assert changed(20, 50)  # top cue
    assert not changed(90, 130)  # between the two regions
