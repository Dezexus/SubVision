from typing import Literal

from pydantic import BaseModel


class BlurSettings(BaseModel):
    """Configuration for the blur rendering process."""

    mode: Literal["blur", "hybrid", "sttn"] = "hybrid"
    y: int = 912
    font_size: int = 30
    sigma: int = 5
    feather: int = 40
    width_multiplier: float = 1.0
    height_multiplier: float = 1.5
    encoder: str = "auto"
