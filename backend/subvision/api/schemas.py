from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from subvision.domain.models import BlurSettings


class VideoMetadata(BaseModel):
    filename: str
    original_filename: str = ""
    total_frames: int
    width: int
    height: int
    fps: float
    duration: float
    display_aspect_ratio: float = 1.0


class PreviewConfig(BaseModel):
    filename: str
    frame_index: int
    roi: List[int]
    scale_factor: float


class ProcessConfig(BaseModel):
    filename: str
    client_id: str
    preset: str = Field(default="⚖️ Balance")
    languages: str = Field(default="en")
    roi: List[int] = Field(default=[0, 0, 0, 0])
    step: Optional[int] = None
    min_conf: Optional[float] = None
    conf_threshold: Optional[float] = None
    scale_factor: Optional[float] = None
    denoise_strength: Optional[float] = None
    smart_skip: Optional[bool] = None
    motion_mse_thresh: Optional[float] = None
    gap_tolerance: Optional[int] = None


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


class WebSocketMessage(BaseModel):
    type: str
    payload: Optional[Dict[str, Any]] = None
