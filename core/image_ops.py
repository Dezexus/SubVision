import cv2
import numpy as np
from PIL import Image


# ... (other functions remain the same: apply_clahe, denoise_frame, apply_sharpening, calculate_image_diff, extract_frame_cv2) ...

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
