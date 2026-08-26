"""Tests for render effect configuration."""

from subvision.rendering.models import RenderTaskConfig
from subvision.domain.models import BlurSettings


def test_build_effects_propainter_mode():
    config = RenderTaskConfig(
        filename="v.mp4",
        client_id="c1",
        subtitles=[{"id": 1, "text": "Hello", "start": 0.0, "end": 1.0}],
        blur_settings=BlurSettings(mode="propainter"),
    )
    effects = config.build_effects()
    assert len(effects) == 2
    assert effects[0].__class__.__name__ == "ProPainterInpaintEffect"
    assert effects[1].__class__.__name__ == "BlurEffect"
