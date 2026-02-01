from typing import Any

import cv2
import numpy as np


def apply_clahe(
    frame: np.ndarray | None,
    clip_limit: float = 2.0,
    tile_grid_size: tuple[int, int] = (8, 8),
) -> np.ndarray | None:
    """Applies CLAHE (Contrast Limited Adaptive Histogram Equalization)."""
    if frame is None:
        return None
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    cl = clahe.apply(l_channel)
    limg = cv2.merge((cl, a_channel, b_channel))
    return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)


def denoise_frame(frame: np.ndarray | None, strength: float) -> np.ndarray | None:
    """Applies Fast Non-Local Means Denoising."""
    if frame is None or strength <= 0:
        return frame
    h_val = float(strength)
    return cv2.fastNlMeansDenoisingColored(frame, None, h_val, h_val, 7, 21)


def apply_scaling(frame: np.ndarray | None, scale_factor: float) -> np.ndarray | None:
    """Resizes the frame by the given factor using cubic interpolation."""
    if frame is None or scale_factor == 1.0:
        return frame
    return cv2.resize(frame, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_CUBIC)


def apply_sharpening(frame: np.ndarray | None) -> np.ndarray | None:
    """Applies a basic sharpening kernel."""
    if frame is None:
        return None
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    return cv2.filter2D(frame, -1, kernel)


def calculate_image_diff(img1: np.ndarray | None, img2: np.ndarray | None) -> float:
    """Calculates normalized MSE between two images."""
    if img1 is None or img2 is None:
        return 1.0
    if img1.shape != img2.shape:
        return 1.0

    g1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    g1_small = cv2.resize(g1, (64, 64))
    g2_small = cv2.resize(g2, (64, 64))

    g1_float = g1_small.astype("float")
    g2_float = g2_small.astype("float")

    err = np.sum((g1_float - g2_float) ** 2)
    err /= float(g1_small.shape[0] * g1_small.shape[1])
    return float(err / 65025.0)


def extract_frame_cv2(video_path: str, frame_index: int) -> np.ndarray | None:
    """Extracts a single frame without HW acceleration."""
    if not video_path:
        return None

    cap = cv2.VideoCapture(
        video_path,
        cv2.CAP_FFMPEG,
        [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE],
    )

    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, frame = cap.read()
        return frame if ok else None
    finally:
        cap.release()


def calculate_roi_from_mask(
    image_dict: dict[str, Any] | None,
) -> list[int]:
    """Extracts bounding box [x, y, w, h] from a Gradio mask dictionary."""
    if not image_dict:
        return [0, 0, 0, 0]

    layers = image_dict.get("layers")
    if layers and len(layers) > 0:
        mask = layers[0]
        if isinstance(mask, np.ndarray) and mask.ndim == 3 and mask.shape[2] == 4:
            coords = cv2.findNonZero(mask[:, :, 3])
            if coords is not None:
                x, y, w, h = cv2.boundingRect(coords)
                return [int(x), int(y), int(w), int(h)]

    return [0, 0, 0, 0]
