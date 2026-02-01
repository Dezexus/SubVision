import cv2
import numpy as np
from PIL import Image


def apply_clahe(frame, clip_limit=2.0, tile_grid_size=(8, 8)):
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
    if frame is None:
        return None
    return cv2.fastNlMeansDenoisingColored(frame, None, strength, strength, 7, 21)


def apply_sharpening(frame):
    if frame is None:
        return None
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    return cv2.filter2D(frame, -1, kernel)


def calculate_image_diff(img1, img2):
    if img1 is None or img2 is None: return 1.0
    if img1.shape != img2.shape: return 1.0

    g1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    g1_small = cv2.resize(g1, (64, 64))
    g2_small = cv2.resize(g2, (64, 64))

    err = np.sum((g1_small.astype("float") - g2_small.astype("float")) ** 2)
    err /= float(g1_small.shape[0] * g1_small.shape[1])
    return err / 65025.0


def extract_frame_cv2(video_path, frame_index):
    """
    Extracts a frame with HW acceleration DISABLED via constructor.
    """
    if video_path is None:
        return None

    # Pass HW disabled params in constructor
    cap = cv2.VideoCapture(
        video_path,
        cv2.CAP_FFMPEG,
        [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE]
    )

    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    cap.release()

    if not ok:
        return None

    return frame


def calculate_roi_from_mask(image_dict):
    """
    Calculates ROI coordinates [x, y, w, h] from Gradio image mask.
    Handles edge cases where mask is empty or not yet initialized.
    """
    if not image_dict:
        return [0, 0, 0, 0]

    # Check if 'layers' key exists and is not empty
    if "layers" in image_dict and len(image_dict["layers"]) > 0:
        mask = image_dict["layers"][0]

        # Check if mask has valid dimensions (H, W, 4) for RGBA
        if mask is not None and mask.ndim == 3 and mask.shape[2] == 4:
            coords = cv2.findNonZero(mask[:, :, 3])  # Alpha channel

            if coords is not None:
                x, y, w, h = cv2.boundingRect(coords)
                return [int(x), int(y), int(w), int(h)]

    return [0, 0, 0, 0]
