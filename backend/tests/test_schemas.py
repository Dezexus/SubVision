import pytest
from pydantic import ValidationError

from subvision.api.schemas import ProcessConfig, RenderConfig
from subvision.domain.models import BlurSettings


def test_blur_settings_defaults():
    settings = BlurSettings()
    assert settings.mode == "hybrid"
    assert settings.sigma == 5


def test_process_config_requires_filename():
    config = ProcessConfig(filename="abc.mp4", client_id="c1")
    assert config.preset == "⚖️ Balance"


def test_render_config_validates_blur_settings():
    config = RenderConfig(
        filename="v.mp4",
        client_id="c1",
        subtitles=[],
        blur_settings=BlurSettings(mode="hybrid"),
    )
    assert config.blur_settings.mode == "hybrid"
    assert config.blur_settings.height_multiplier == 1.5


def test_removed_render_mode_is_rejected():
    with pytest.raises(ValidationError):
        BlurSettings(mode="propainter")
