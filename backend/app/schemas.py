from typing import List, Optional
from pydantic import BaseModel

class VideoMetadata(BaseModel):
    """Data model for video file information."""
    filename: str
    total_frames: int
    width: int
    height: int
    fps: float
    duration: float

class PreviewConfig(BaseModel):
    """Configuration for generating a frame preview."""
    filename: str
    frame_index: int
    roi: List[int]
    clahe_limit: float
    scale_factor: float
    denoise: float

class ProcessConfig(BaseModel):
    """Configuration for starting the OCR process."""
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
    use_llm: bool = False
    llm_repo: str = "bartowski/google_gemma-3-4b-it-GGUF"
    llm_filename: str = "google_gemma-3-4b-it-Q4_K_M.gguf"
    llm_prompt: Optional[str] = None
