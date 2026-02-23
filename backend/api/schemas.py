"""
Pydantic models for data validation and API request schemas.
"""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class VideoMetadata(BaseModel):
    """
    Schema defining the structural metadata of an uploaded video.
    """
    filename: str
    total_frames: int
    width: int
    height: int
    fps: float
    duration: float


class PreviewConfig(BaseModel):
    """
    Configuration schema for requesting a processed frame preview.
    """
    filename: str
    frame_index: int
    roi: List[int]
    scale_factor: float


class ProcessConfig(BaseModel):
    """
    Configuration schema outlining parameters for the OCR extraction task.
    """
    filename: str
    client_id: str
    roi: List[int]
    preset: str = "⚖️ Balance"
    languages: str = "en"
    step: int = 2
    conf_threshold: float = 80.0
    scale_factor: float = 2.0
    smart_skip: bool = True


class BlurSettings(BaseModel):
    """
    Settings schema defining the dimensions and style of the text obscuring filter.
    """
    mode: str = "blur"
    y: int = 900
    font_size: int = 21
    padding_x: int = 40
    padding_y: float = 2.0
    sigma: int = 40
    feather: int = 30
    width_multiplier: float = 1.0


class RenderConfig(BaseModel):
    """
    Configuration schema to initiate the final video rendering pipeline.
    """
    filename: str
    client_id: str
    subtitles: List[dict]
    blur_settings: BlurSettings


class BlurPreviewConfig(BaseModel):
    """
    Schema for generating a static frame preview of the selected blur settings.
    """
    filename: str
    frame_index: int
    blur_settings: BlurSettings
    subtitle_text: str


class WebSocketMessage(BaseModel):
    """
    Schema for validating incoming WebSocket messages.
    """
    type: str
    payload: Optional[Dict[str, Any]] = None
