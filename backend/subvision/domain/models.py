from typing import Literal

from pydantic import BaseModel


class BlurSettings(BaseModel):
    """Configuration for the blur rendering process."""

    mode: Literal["blur", "hybrid"] = "hybrid"
    y: int = 912
    # Which edge of the zone stays put as cue text length changes. Matches how
    # the burned-in text is aligned: left-aligned text grows to the right.
    align: Literal["center", "left", "right"] = "center"
    # Horizontal position of that anchor (zone center, left or right edge),
    # as a shift from the frame center in px.
    x_offset: int = 0
    font_size: int = 30
    sigma: int = 5
    feather: int = 40
    width_multiplier: float = 1.0
    height_multiplier: float = 1.5
    encoder: str = "auto"
