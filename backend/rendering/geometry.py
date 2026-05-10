import math
import re
from typing import Tuple, Dict, Any

def estimate_text_width(text: str, font_size: int, width_multiplier: float) -> int:
    """Calculate the approximate width of a text string in pixels."""
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

def calculate_text_roi(text: str, width: int, height: int, settings: Dict[str, Any]) -> Tuple[int, int, int, int]:
    """Calculate the coordinates of the text base rectangle (green area)."""
    if not text:
        return 0, 0, 0, 0

    y_pos = int(settings.get('y', height - 50))
    if y_pos > height:
        y_pos = height - 50

    font_size_px = int(settings.get('font_size', 21))
    width_multiplier = float(settings.get('width_multiplier', 1.0))
    height_multiplier = float(settings.get('height_multiplier', 1.0))

    lines = text.split('\n')
    max_line_width = 0
    for line in lines:
        line_width = estimate_text_width(line, font_size_px, width_multiplier)
        if line_width > max_line_width:
            max_line_width = line_width
    num_lines = len(lines)

    text_h = int((font_size_px + 4) * num_lines * height_multiplier)
    text_w = max_line_width

    x = (width - text_w) // 2
    y = y_pos - text_h

    final_x = max(0, x)
    final_y = max(0, y)
    final_w = min(width - final_x, text_w)
    final_h = min(height - final_y, text_h)

    return final_x, final_y, final_w, final_h

def calculate_blur_roi(text: str, width: int, height: int, settings: Dict[str, Any]) -> Tuple[int, int, int, int]:
    """Calculate the coordinates of the adaptive blur region (red area) preventing sharp edges."""
    if not text:
        return 0, 0, 0, 0

    font_size_px = int(settings.get('font_size', 21))
    tx, ty, tw, th = calculate_text_roi(text, width, height, settings)

    feather = int(settings.get('feather', 30))

    pad_x = int(font_size_px * 0.8) + feather
    pad_y = int(font_size_px * 0.3) + 4 + feather

    left = tx - pad_x
    top = ty - pad_y
    right = tx + tw + pad_x
    bottom = ty + th + pad_y

    final_x = max(0, left)
    final_y = max(0, top)
    final_w = max(0, min(width, right) - final_x)
    final_h = max(0, min(height, bottom) - final_y)

    return final_x, final_y, final_w, final_h