from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from rendering.models import BlurSettings

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
    roi: List[int]
    preset: str = "⚖️ Balance"
    languages: str = "en"
    step: int = 2
    conf_threshold: float = 80.0
    scale_factor: float = 2.0
    smart_skip: bool = True

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