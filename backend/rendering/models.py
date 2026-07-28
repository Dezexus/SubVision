from typing import List, Dict, Any
from pydantic import BaseModel

class BlurSettings(BaseModel):
    """Configuration for the blur rendering process."""
    mode: str = "hybrid"
    y: int = 912
    font_size: int = 30
    sigma: int = 5
    feather: int = 40
    width_multiplier: float = 1.0
    height_multiplier: float = 1.2
    encoder: str = "auto"

class RenderTaskConfig(BaseModel):
    """Configuration for a video rendering task."""
    filename: str
    client_id: str
    blur_settings: BlurSettings
    subtitles: List[Dict[str, Any]]

    def build_effects(self) -> List[Any]:
        """Builds rendering effects based on config."""
        from rendering.effects.blur import BlurEffect
        from rendering.effects.inpainting import InpaintEffect
        from rendering.effects.lama import LaMaInpaintEffect

        effects = []
        blur_dict = self.blur_settings.model_dump()
        mode = blur_dict.get('mode', 'hybrid')

        if mode == 'hybrid':
            inpaint = InpaintEffect(blur_dict)
            effects.append(inpaint)
        elif mode == 'lama':
            lama_inpaint = LaMaInpaintEffect(blur_dict)
            effects.append(lama_inpaint)

        blur_effect = BlurEffect(blur_dict)
        effects.append(blur_effect)
        return effects