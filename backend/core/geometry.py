"""
Module for calculating geometries, bounding boxes, and text dimensions.
"""
import math
import re
from typing import Any, Tuple, Dict

def estimate_text_width(text: str, font_size: int, width_multiplier: float) -> int:
    """
    Calculates pixel width of text using an empirical heuristic matching the frontend UI.
    Provides robust support for CJK characters which OpenCV fonts lack.
    """
    if not text:
        return 0

    width = 0.0
    for char in text:
        if re.match(r'[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]', char):
            width += 1.1
        elif re.match(r'[mwWM@OQG]', char):
            width += 0.95
        elif re.match(r'[A-Z]', char):
            width += 0.8
        elif re.match(r'[0-9]', char):
            width += 0.65
        elif re.match(r'[il1.,!I|:;tfj]', char):
            width += 0.35
        else:
            width += 0.65

    return int(math.ceil(width * font_size * width_multiplier))

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

    left = x - padding_x
    top = y - padding_y_px
    right = left + text_w + (padding_x * 2)
    bottom = top + text_h + (padding_y_px * 2)

    final_x = max(0, left)
    final_y = max(0, top)
    final_w = max(0, min(width, right) - final_x)
    final_h = max(0, min(height, bottom) - final_y)

    return final_x, final_y, final_w, final_h
