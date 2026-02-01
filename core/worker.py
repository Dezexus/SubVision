import threading
import cv2
import traceback
import gc
import time
from collections import Counter

from .ocr_engine import PaddleWrapper
from .image_ops import apply_clahe, apply_sharpening, denoise_frame, calculate_image_diff
from .llm_engine import GemmaBatchFixer
from .utils import format_timestamp, is_similar, is_better_quality


class OCRWorker(threading.Thread):
    def __init__(self, params, callbacks):
        super().__init__()
        self.params = params
        self.cb = callbacks
        self.is_running = True
        self.ocr_engine = None

    def stop(self):
        self.is_running = False

    def _log(self, msg):
        if self.cb.get('log'):
            self.cb['log'](msg)

    def _emit_subtitle(self, sub_item):
        if self.cb.get('subtitle'):
            self.cb['subtitle'](sub_item)

    def _emit_ai_update(self, sub_item):
        if self.cb.get('ai_update'):
            self.cb['ai_update'](sub_item)

    def run(self):
        srt_data = []
        try:
            self._log(f"--- START OCR ---")
            step = self.params['step']
            roi = self.params['roi']
            video_path = self.params['video_path']
            clip_limit_val = self.params.get('clip_limit', 2.0)
            min_conf = self.params.get('min_conf', 0.80)

            self.ocr_engine = PaddleWrapper(lang=self.params.get('langs', 'en'))
            device_name = "GPU" if self.ocr_engine.use_gpu else "CPU"
            self._log(f"Device: {device_name} | CLAHE: {clip_limit_val} | Min Conf: {int(min_conf * 100)}%")
            self._log(f"Pipeline: Smart Skip + Visual Cutoff -> CLAHE -> OCR")

            cap = cv2.VideoCapture(video_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

            current_start = None
            current_text = ""
            current_conf = 0.0
            frame_idx = 0
            subtitle_buffer = []
            MAX_BUFFER_SIZE = 5

            # Optimization & Logic state
            last_processed_img = None
            last_ocr_result = ("", 0.0)
            active_sub_snapshot = None  # Snapshot of ROI when subtitle started
            skipped_frames_count = 0

            start_time = time.time()

            while self.is_running:
                ok, frame = cap.read()
                if not ok:
                    break

                if self.cb.get('progress'):
                    elapsed = time.time() - start_time
                    eta_str = "--:--"
                    if frame_idx > 0:
                        avg_time = elapsed / frame_idx
                        remain_frames = total_frames - frame_idx
                        eta_sec = int(remain_frames * avg_time)
                        eta_str = f"{eta_sec // 60:02d}:{eta_sec % 60:02d}"
                    self.cb['progress'](frame_idx, total_frames, eta_str)

                current_ts = frame_idx / fps

                # --- ROI Extraction ---
                h, w = frame.shape[:2]
                if roi and roi[2] > 0:
                    y1, y2 = max(0, roi[1]), min(h, roi[1] + roi[3])
                    x1, x2 = max(0, roi[0]), min(w, roi[0] + roi[2])
                    frame_roi = frame[y1:y2, x1:x2]
                else:
                    frame_roi = frame

                # --- Visual Cutoff Logic (Instant End) ---
                # Check every frame (ignoring step) if we have an active subtitle
                if current_text and active_sub_snapshot is not None and frame_roi.size > 0:
                    # Quick denoise for comparison
                    curr_denoised = denoise_frame(frame_roi, strength=3)
                    cutoff_diff = calculate_image_diff(curr_denoised, active_sub_snapshot)

                    # If scene changed significantly (>15%), cut the subtitle immediately
                    if cutoff_diff > 0.15:
                        # self._log(f"✂ Visual Cutoff at {current_ts:.2f}s (Diff: {cutoff_diff:.3f})")
                        item = {'id': len(srt_data) + 1, 'start': current_start, 'end': current_ts,
                                'text': current_text, 'conf': current_conf}
                        srt_data.append(item)
                        self._emit_subtitle(item)

                        # Reset State
                        current_text, current_start, current_conf = "", None, 0.0
                        active_sub_snapshot = None
                        subtitle_buffer = []  # Clear buffer to prevent "ghost" detections

                # --- Main OCR Loop (Respects Step) ---
                if frame_idx % step == 0 and frame_roi.size > 0:
                    denoised = denoise_frame(frame_roi, strength=3)

                    # Smart Skip
                    diff = calculate_image_diff(denoised, last_processed_img)
                    if diff < 0.005 and last_processed_img is not None:
                        text_res_tuple = last_ocr_result
                        skipped_frames_count += 1
                    else:
                        clahe_processed = apply_clahe(denoised, clip_limit=clip_limit_val)
                        upscaled = cv2.resize(clahe_processed, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
                        final_processed = apply_sharpening(upscaled)

                        try:
                            res = self.ocr_engine.predict(final_processed)
                            text, conf = PaddleWrapper.parse_results(res, self.params['conf'])
                            text_res_tuple = (text, conf)
                        except Exception:
                            text_res_tuple = ("", 0.0)

                        last_processed_img = denoised.copy()
                        last_ocr_result = text_res_tuple

                    subtitle_buffer.append(text_res_tuple)
                    if len(subtitle_buffer) > MAX_BUFFER_SIZE:
                        subtitle_buffer.pop(0)

                    valid_texts = [t[0] for t in subtitle_buffer if t[0]]
                    if valid_texts:
                        count_res = Counter(valid_texts).most_common(1)
                        stable_text = count_res[0][0]
                        matching_confs = [t[1] for t in subtitle_buffer if t[0] == stable_text]
                        stable_conf = sum(matching_confs) / len(matching_confs) if matching_confs else 0.0
                    else:
                        stable_text, stable_conf = "", 0.0

                    # Logic to Start/Update Subtitle
                    if is_similar(stable_text, current_text, 0.5):
                        if is_better_quality(stable_text, current_text):
                            current_text = stable_text
                            current_conf = stable_conf
                            # Update snapshot if quality improved significantly? No, keep original start snapshot for stability.
                    else:
                        # New text detected via OCR
                        if stable_text and stable_conf >= min_conf:
                            # Close previous if exists
                            if current_text:
                                item = {'id': len(srt_data) + 1, 'start': current_start, 'end': current_ts,
                                        'text': current_text, 'conf': current_conf}
                                srt_data.append(item)
                                self._emit_subtitle(item)

                            # Start new
                            current_start = current_ts
                            current_text = stable_text
                            current_conf = stable_conf
                            active_sub_snapshot = denoised.copy()  # Capture baseline for Cutoff

                        # Text disappeared via OCR buffer logic (backup to Visual Cutoff)
                        elif not stable_text and current_text:
                            # Use buffer lag only if Visual Cutoff didn't trigger yet
                            buffer_lag = (len(subtitle_buffer) / 2) * (step / fps)
                            actual_end = max(current_start + 0.1, current_ts - buffer_lag)

                            item = {'id': len(srt_data) + 1, 'start': current_start, 'end': actual_end,
                                    'text': current_text, 'conf': current_conf}
                            srt_data.append(item)
                            self._emit_subtitle(item)

                            current_text, current_start, current_conf = "", None, 0.0
                            active_sub_snapshot = None

                frame_idx += 1

            # Final cleanup
            if current_text and current_start and current_conf >= min_conf:
                item = {'id': len(srt_data) + 1, 'start': current_start, 'end': total_frames / fps,
                        'text': current_text, 'conf': current_conf}
                srt_data.append(item)
                self._emit_subtitle(item)

            cap.release()
            self._log(f"⚡ Smart Skip optimized {skipped_frames_count} frames")

            if self.params.get('use_llm', False) and srt_data:
                self._log("--- AI Editing (Gemma) ---")
                fixer = GemmaBatchFixer(self._log)
                if fixer.load_model():
                    raw_langs = self.params.get('langs', 'en')
                    user_lang = raw_langs.replace(',', '+').split('+')[0].strip()
                    fixer.fix_all_in_one_go(srt_data, lang=user_lang)
                    for item in srt_data:
                        self._emit_ai_update(item)
                    fixer.unload()

            self.cb['finish'](True)
        except Exception as e:
            self._log(f"CRITICAL: {e}\n{traceback.format_exc()}")
            self.cb['finish'](False)
        finally:
            try:
                with open(self.params['output_path'], "w", encoding="utf-8") as f:
                    for item in srt_data:
                        f.write(
                            f"{item['id']}\n{format_timestamp(item['start'])} --> {format_timestamp(item['end'])}\n{item['text']}\n\n")
                self._log(f"Saved: {self.params['output_path']}")
            except Exception:
                pass

            if self.ocr_engine:
                del self.ocr_engine
                self.ocr_engine = None

            gc.collect()
            try:
                import paddle
                paddle.device.cuda.empty_cache()
            except ImportError:
                pass
