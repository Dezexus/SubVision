"""
Centralized module for defining algorithmic, heuristic, and system constants.
"""
import numpy as np

MAX_QUEUE_SIZE: int = 30
OCR_BATCH_SIZE: int = 4
WATCHDOG_TIMEOUT_SEC: float = 45.0
DEFAULT_FPS: float = 25.0

MOTION_BLUR_KSIZE: tuple[int, int] = (5, 5)
MOTION_DIFF_THRESH: float = 15.0
MOTION_PIXEL_COUNT_THRESH: int = 15

SHARPEN_KERNEL_LIST: list[list[int]] = [[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]]
SHARPEN_KERNEL_NP: np.ndarray = np.array(SHARPEN_KERNEL_LIST, dtype=np.float32)

SUBTITLE_SIMILARITY_THRESH: float = 0.6
