from typing import List, Optional, Any
from pydantic import BaseModel

class VideoMetadata(BaseModel):
    filename: str
    total_frames: int
    width: int
    height: int
    fps: float
    duration: float

class PreviewConfig(BaseModel):
    filename: str
    frame_index: int
    roi: List[int]
    clahe_limit: float
    scale_factor: float
    denoise: float

class ProcessConfig(BaseModel):
    filename: str
    client_id: str
    roi: List[int]
    preset: str = "⚖️ Balance"
    languages: str = "en"
    step: int = 2
    conf_threshold: float = 80.0
    clahe_limit: float = 2.0
    scale_factor: float = 2.0
    smart_skip: bool = True
    visual_cutoff: bool = True

class BlurSettings(BaseModel):
    y: int = 900
    font_scale: float = 1.2
    padding_x: int = 20
    padding_y: int = 10
    sigma: int = 15
    feather: int = 10

    # Legacy fields
    x: Optional[int] = 0
    w: Optional[int] = 0
    h: Optional[int] = 0

class RenderConfig(BaseModel):
    filename: str
    client_id: str
    subtitles: List[dict]
    blur_settings: BlurSettings
