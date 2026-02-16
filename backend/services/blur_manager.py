import cv2
import numpy as np
import logging
import os
import subprocess

logger = logging.getLogger(__name__)

class BlurManager:
    """
    Manages dynamic blur application with soft edges (feathering).
    """

    def apply_blur_task(
            self,
            video_path: str,
            subtitles: list[dict],
            blur_settings: dict,
            output_path: str,
            progress_callback=None
    ):
        base_name, ext = os.path.splitext(output_path)
        temp_video_path = f"{base_name}_temp{ext}"

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError("Could not open video file")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        expected_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(temp_video_path, fourcc, fps, (width, height))

        y_pos = int(blur_settings.get('y', height - 50))
        font_scale = float(blur_settings.get('font_scale', 1.0))
        padding_x = int(blur_settings.get('padding_x', 20))
        padding_y = int(blur_settings.get('padding_y', 10))
        sigma = int(blur_settings.get('sigma', 15))
        feather = int(blur_settings.get('feather', 0))

        ksize = (sigma * 2 + 1, sigma * 2 + 1)
        font_face = cv2.FONT_HERSHEY_SIMPLEX
        thickness = 2

        frame_blur_map = {}

        for sub in subtitles:
            text = sub.get('text', '').strip()
            if not text:
                continue

            (text_w, text_h), baseline = cv2.getTextSize(text, font_face, font_scale, thickness)

            x = (width - text_w) // 2
            y = y_pos - text_h

            final_x = max(0, x - padding_x)
            final_y = max(0, y - padding_y)
            final_w = min(width - final_x, text_w + (padding_x * 2))
            final_h = min(height - final_y, text_h + (padding_y * 2))

            roi = (final_x, final_y, final_w, final_h)

            start_f = int(sub['start'] * fps)
            end_f = int(sub['end'] * fps)
            start_f = max(0, start_f - 2)
            end_f = min(expected_frames + 200, end_f + 2)

            for f_idx in range(start_f, end_f):
                frame_blur_map[f_idx] = roi

        processed_frames = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if processed_frames in frame_blur_map:
                    bx, by, bw, bh = frame_blur_map[processed_frames]

                    if bw > 0 and bh > 0:
                        roi_img = frame[by:by+bh, bx:bx+bw]

                        blurred_roi = cv2.GaussianBlur(roi_img, ksize, 0)

                        if feather > 0:
                            # Обеспечиваем, что хотя бы 35% центра остается сплошным
                            safe_feather_w = int(bw * 0.35)
                            safe_feather_h = int(bh * 0.35)
                            eff_feather = min(feather, safe_feather_w, safe_feather_h)

                            if eff_feather < 1:
                                frame[by:by+bh, bx:bx+bw] = blurred_roi
                            else:
                                mask = np.zeros((bh, bw), dtype=np.float32)

                                # Рисуем белый прямоугольник в центре
                                cv2.rectangle(
                                    mask,
                                    (eff_feather, eff_feather),
                                    (bw - eff_feather, bh - eff_feather),
                                    1.0,
                                    -1
                                )

                                # Размываем маску менее агрессивно, чтобы сохранить белый центр
                                # Используем ядро чуть больше размера пера, но не в 2 раза
                                mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
                                if mask_ksize_val % 2 == 0: mask_ksize_val += 1
                                mask_ksize = (mask_ksize_val, mask_ksize_val)

                                mask = cv2.GaussianBlur(mask, mask_ksize, 0)
                                mask_3ch = cv2.merge([mask, mask, mask])

                                roi_float = roi_img.astype(np.float32)
                                blur_float = blurred_roi.astype(np.float32)

                                blended = blur_float * mask_3ch + roi_float * (1.0 - mask_3ch)
                                frame[by:by+bh, bx:bx+bw] = blended.astype(np.uint8)
                        else:
                            frame[by:by+bh, bx:bx+bw] = blurred_roi

                out.write(frame)
                processed_frames += 1

                if progress_callback and processed_frames % 50 == 0:
                    progress_callback(processed_frames, expected_frames)

            if progress_callback:
                progress_callback(expected_frames, expected_frames)

        except Exception as e:
            logger.error(f"Render error: {e}")
            raise e
        finally:
            cap.release()
            out.release()

        try:
            logger.info("Merging audio...")
            command = [
                "ffmpeg", "-y",
                "-i", temp_video_path,
                "-i", video_path,
                "-c:v", "copy",
                "-c:a", "aac",
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-shortest",
                output_path
            ]
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)
        except Exception as e:
            logger.error(f"FFmpeg merge failed: {e}")
            if os.path.exists(temp_video_path):
                if os.path.exists(output_path):
                    os.remove(output_path)
                os.rename(temp_video_path, output_path)

        return output_path
