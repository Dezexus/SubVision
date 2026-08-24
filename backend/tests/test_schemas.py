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
        blur_settings=BlurSettings(mode="lama"),
    )
    assert config.blur_settings.mode == "lama"
