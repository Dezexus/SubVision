from typing import List, Dict, Any
from pydantic import BaseModel

from subvision.domain.models import BlurSettings

__all__ = ["BlurSettings", "RenderTaskConfig"]


class RenderTaskConfig(BaseModel):
    """Configuration for a video rendering task."""

    filename: str
    client_id: str
    blur_settings: BlurSettings
    subtitles: List[Dict[str, Any]]
    original_filename: str | None = None

    def build_effects(self) -> List[Any]:
        """Builds rendering effects based on config."""
        from subvision.rendering.effects.blur import BlurEffect
        from subvision.rendering.effects.inpainting import InpaintEffect

        blur_dict = self.blur_settings.model_dump()
        if self.blur_settings.mode == "sttn":
            from subvision.rendering.effects.sttn import STTNEffect

            return [STTNEffect(blur_dict)]
        if self.blur_settings.mode == "hybrid":
            # InpaintEffect already applies residual ring-blur; full-ROI BlurEffect
            # would soap the reconstructed background.
            return [InpaintEffect(blur_dict)]
        return [BlurEffect(blur_dict)]
