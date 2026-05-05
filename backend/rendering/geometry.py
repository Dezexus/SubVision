import math
import re
from typing import Tuple, Dict, Any

def estimate_text_width(text: str, font_size: int, width_multiplier: float) -> int:
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

    padding_x = float(settings.get('padding_x', 0.4))
    padding_y_factor = float(settings.get('padding_y', 2.0))

    pad_x_px = int(text_w * padding_x)
    pad_y_px = int(text_h * padding_y_factor)

    x = (width - text_w) // 2
    y = y_pos - text_h

    left = x - pad_x_px
    top = y - pad_y_px
    right = left + text_w + (pad_x_px * 2)
    bottom = top + text_h + (pad_y_px * 2)

    final_x = max(0, left)
    final_y = max(0, top)
    final_w = max(0, min(width, right) - final_x)
    final_h = max(0, min(height, bottom) - final_y)

    return final_x, final_y, final_w, final_h