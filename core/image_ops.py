import cv2
import numpy as np
from PIL import Image


def apply_clahe(frame, clip_limit=2.0, tile_grid_size=(8, 8)):
    """
    Applies CLAHE (Contrast Limited Adaptive Histogram Equalization).
    """
    if frame is None:
        return None

    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    cl = clahe.apply(l)
    limg = cv2.merge((cl, a, b))
    processed = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
    return processed


def denoise_frame(frame, strength=5):
    """
    Applies fast denoising to remove grain enhanced by CLAHE.
    """
    if frame is None:
        return None
    return cv2.fastNlMeansDenoisingColored(frame, None, strength, strength, 7, 21)


def apply_sharpening(frame):
    """
    Applies a sharpening kernel to enhance edges after upscaling.
    """
    if frame is None:
        return None

    kernel = np.array([[-1, -1, -1],
                       [-1, 9, -1],
                       [-1, -1, -1]])

    return cv2.filter2D(frame, -1, kernel)


def extract_frame_cv2(video_path, frame_index):
    """
    Extracts a single frame from video by index.
    """
    if video_path is None:
        return None

    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    cap.release()

    if not ok:
        return None

    return frame


def calculate_roi_from_mask(image_dict):
    """
    Calculates ROI coordinates [x, y, w, h] from Gradio image mask.
    """
    if not image_dict or not "layers" in image_dict:
        return [0, 0, 0, 0]

    mask = image_dict["layers"][0]
    coords = cv2.findNonZero(mask[:, :, 3])

    if coords is None:
        return [0, 0, 0, 0]

    x, y, w, h = cv2.boundingRect(coords)
    return [int(x), int(y), int(w), int(h)]
