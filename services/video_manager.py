import cv2
import os
from PIL import Image
from core.image_ops import extract_frame_cv2, calculate_roi_from_mask, apply_clahe, apply_sharpening, denoise_frame


class VideoManager:
    @staticmethod
    def get_video_info(video_path):
        """Returns frame, total count and metadata for UI."""
        os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "1"
        if video_path is None:
            return None, 1

        cap = cv2.VideoCapture(video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        ok, frame = cap.read()
        cap.release()

        if not ok:
            return None, 1

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return frame_rgb, total

    @staticmethod
    def get_frame_image(video_path, frame_index):
        """Returns PIL Image of a specific frame."""
        frame = extract_frame_cv2(video_path, frame_index)
        if frame is None:
            return None
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    @staticmethod
    def generate_preview(video_path, frame_index, editor_data, clahe_val):
        """Generates processed preview with filters."""
        if video_path is None:
            return None

        frame_bgr = extract_frame_cv2(video_path, frame_index)
        if frame_bgr is None:
            return None

        roi = calculate_roi_from_mask(editor_data)
        if roi[2] > 0:
            h_img, w_img = frame_bgr.shape[:2]
            x = min(max(0, roi[0]), w_img)
            y = min(max(0, roi[1]), h_img)
            w = min(roi[2], w_img - x)
            h = min(roi[3], h_img - y)
            frame_roi = frame_bgr[y:y + h, x:x + w]
        else:
            frame_roi = frame_bgr

        # Pipeline visualization
        denoised = denoise_frame(frame_roi, strength=3)
        processed = apply_clahe(denoised, clip_limit=clahe_val)
        processed = cv2.resize(processed, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        final = apply_sharpening(processed)

        return Image.fromarray(cv2.cvtColor(final, cv2.COLOR_BGR2RGB))
