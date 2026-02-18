from typing import List, Optional
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
    type: str = "box"
    y: int = 900
    font_size: int = 21
    padding_x: int = 40
    padding_y: float = 2.0
    sigma: int = 40
    feather: int = 30

class RenderConfig(BaseModel):
    filename: str
    client_id: str
    subtitles: List[dict]
    blur_settings: BlurSettings

class BlurPreviewConfig(BaseModel):
    filename: str
    frame_index: int
    blur_settings: BlurSettings
    subtitle_text: str
