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
    propainter_neighbor_length: int = 6
    propainter_ref_stride: int = 10
    propainter_subvideo_length: int = 30
    propainter_fp16: bool = True
    propainter_roi_pad: int = 32
    propainter_mask_dilation: int = 4
