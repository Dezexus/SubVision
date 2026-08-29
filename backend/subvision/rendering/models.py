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
        from subvision.rendering.effects.propainter import ProPainterInpaintEffect

        effects = []
        blur_dict = self.blur_settings.model_dump()
        mode = blur_dict.get("mode", "hybrid")

        if mode == "hybrid":
            # InpaintEffect already applies residual ring-blur; full-ROI BlurEffect
            # would soap the reconstructed background.
            effects.append(InpaintEffect(blur_dict))
        elif mode == "propainter":
            # ProPainter already fills the ROI; a follow-up blur smears any
            # residual dark fill into letter-shaped blobs.
            effects.append(ProPainterInpaintEffect(blur_dict))
        else:
            effects.append(BlurEffect(blur_dict))
        return effects
