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
        blur_settings=BlurSettings(mode="propainter"),
    )
    assert config.blur_settings.mode == "propainter"


def test_blur_settings_propainter_defaults():
    settings = BlurSettings(mode="propainter")
    assert settings.propainter_neighbor_length == 6
    assert settings.propainter_subvideo_length == 30
    assert settings.propainter_fp16 is True
