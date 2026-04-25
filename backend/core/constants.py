"""
Centralized algorithmic, heuristic, and system constants.
"""
import numpy as np

MOTION_BLUR_KSIZE: tuple[int, int] = (5, 5)
MOTION_DIFF_THRESH: float = 15.0
MOTION_PIXEL_COUNT_THRESH: int = 15

SHARPEN_KERNEL_LIST: list[list[int]] = [[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]]
SHARPEN_KERNEL_NP: np.ndarray = np.array(SHARPEN_KERNEL_LIST, dtype=np.float32)

SUBTITLE_SIMILARITY_THRESH: float = 0.6