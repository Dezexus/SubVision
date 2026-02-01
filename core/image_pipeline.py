import cv2
from .image_ops import apply_clahe, apply_sharpening, denoise_frame, calculate_image_diff


class ImagePipeline:
    def __init__(self, roi, clahe_limit, smart_skip_enabled):
        self.roi = roi
        self.clahe_limit = clahe_limit
        self.smart_skip = smart_skip_enabled
        self.last_processed_img = None
        self.skipped_count = 0

    def process(self, frame):
        """
        Возвращает (ready_image, is_skipped)
        """
        # 1. Crop ROI
        h, w = frame.shape[:2]
        if self.roi and self.roi[2] > 0:
            x, y, w_roi, h_roi = self.roi
            # Clamp coordinates
            y1, y2 = max(0, y), min(h, y + h_roi)
            x1, x2 = max(0, x), min(w, x + w_roi)
            frame_roi = frame[y1:y2, x1:x2]
        else:
            frame_roi = frame

        if frame_roi.size == 0:
            return None, True

        # 2. Denoise (Самая тяжелая операция)
        denoised = denoise_frame(frame_roi, strength=3)

        # 3. Smart Skip Logic
        if self.smart_skip and self.last_processed_img is not None:
            diff = calculate_image_diff(denoised, self.last_processed_img)
            if diff < 0.005:
                self.skipped_count += 1
                return None, True  # Skip this frame

        # 4. Enhance
        processed = apply_clahe(denoised, clip_limit=self.clahe_limit)
        processed = cv2.resize(processed, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        final = apply_sharpening(processed)

        # Обновляем состояние
        self.last_processed_img = denoised.copy()

        return final, False
