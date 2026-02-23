"""
Module for calculating geometries, bounding boxes, and text dimensions.
"""
import math
from typing import Any, Tuple, Dict
import cv2


def estimate_text_width(text: str, font_size: int, width_multiplier: float) -> int:
    """
    Calculates precise pixel width of text using OpenCV font rendering metrics.
    """
    if not text:
        return 0

    font_scale = font_size / 22.0
    thickness = max(1, int(font_scale * 2))

    size, _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)

    return int(math.ceil(size[0] * width_multiplier))


def calculate_blur_roi(text: str, width: int, height: int, settings: Dict[str, Any]) -> Tuple[int, int, int, int]:
    """
    Calculates the Region of Interest bounding box for the given text.
    """
    if not text:
        return 0, 0, 0, 0

    y_pos = int(settings.get('y', height - 50))
    font_size_px = int(settings.get('font_size', 21))
    width_multiplier = float(settings.get('width_multiplier', 1.0))

    text_h = font_size_px + 4
    text_w = estimate_text_width(text, font_size_px, width_multiplier)

    padding_x = int(settings.get('padding_x', 40))
    padding_y_factor = float(settings.get('padding_y', 2.0))
    padding_y_px = int(text_h * padding_y_factor)

    x = (width - text_w) // 2
    y = y_pos - text_h

    final_x = max(0, x - padding_x)
    final_y = max(0, y - padding_y_px)

    raw_w = text_w + (padding_x * 2)
    raw_h = text_h + (padding_y_px * 2)

    final_w = min(width - final_x, raw_w)
    final_h = min(height - final_y, raw_h)

    return final_x, final_y, final_w, final_h
