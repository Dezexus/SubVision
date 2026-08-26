from pydantic import BaseModel


class BlurSettings(BaseModel):
    """Configuration for the blur rendering process."""

    mode: str = "hybrid"
    y: int = 912
    font_size: int = 30
    sigma: int = 5
    feather: int = 40
    width_multiplier: float = 1.0
    height_multiplier: float = 1.5
    encoder: str = "auto"
    # Tuned for ~5–10 min video on 6 GB VRAM (RTX 2060-class).
    propainter_neighbor_length: int = 8
    propainter_ref_stride: int = 8
    propainter_subvideo_length: int = 40
    propainter_fp16: bool = True
    propainter_roi_pad: int = 40
    propainter_mask_dilation: int = 6
    propainter_max_width: int = 640
    propainter_max_clip_frames: int = 48
