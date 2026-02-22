"""
Facade module exposing re-exported image operation functions for backward compatibility.
"""
from core.geometry import calculate_roi_from_mask
from core.filters import (
    ensure_gpu,
    ensure_cpu,
    denoise_frame,
    apply_scaling,
    apply_sharpening,
    apply_scaling_paddle,
    apply_sharpening_paddle
)
from core.motion import detect_change_absolute, detect_change_paddle
from core.video_io import extract_frame_cv2

__all__ = [
    'calculate_roi_from_mask',
    'ensure_gpu',
    'ensure_cpu',
    'denoise_frame',
    'apply_scaling',
    'apply_sharpening',
    'apply_scaling_paddle',
    'apply_sharpening_paddle',
    'detect_change_absolute',
    'detect_change_paddle',
    'extract_frame_cv2'
]
