import threading
import cv2
import traceback
import gc
import time
from collections import Counter

from .ocr_engine import PaddleWrapper
from .image_ops import apply_clahe, apply_sharpening, denoise_frame, calculate_image_diff
from .llm_engine import LLMFixer
from .utils import format_timestamp, is_similar, is_better_quality


class SubtitleEvent:
    """Helper class to track a single subtitle event over time."""

    def __init__(self, text, start_time, conf):
        self.text = text
        self.start = start_time
        self.end = start_time
        self.max_conf = conf
        self.frame_count = 1
        self.gap_frames = 0  # How many frames it was missing (for tolerance)

    def update(self, text, time, conf):
        self.end = time
        self.gap_frames = 0
        self.frame_count += 1

        # Update text if confidence is better or text is longer/cleaner
        if conf > self.max_conf or (conf == self.max_conf and len(text) > len(self.text)):
            self.text = text
            self.max_conf = conf


class OCRWorker(threading.Thread):
    # ... (init, stop, log methods remain same) ...
    def __init__(self, params, callbacks):
        super().__init__()
        self.params = params
        self.cb = callbacks
        self.is_running = True
        self.ocr_engine = None

    def stop(self):
        self.is_running = False

    def _log(self, msg):
        if self.cb.get('log'): self.cb['log'](msg)

    def _emit_subtitle(self, sub_item):
        if self.cb.get('subtitle'): self.cb['subtitle'](sub_item)

    def _emit_ai_update(self, sub_item):
        if self.cb.get('ai_update'): self.cb['ai_update'](sub_item)

    def run(self):
        srt_data = []
        try:
            self._log(f"--- START OCR ---")
            step = self.params['step']
            roi = self.params['roi']
            video_path = self.params['video_path']
            clip_limit_val = self.params.get('clip_limit', 2.0)
            min_conf = self.params.get('min_conf', 0.80)

            use_smart_skip = self.params.get('smart_skip', True)
            use_visual_cutoff = self.params.get('visual_cutoff', True)

            self.ocr_engine = PaddleWrapper(lang=self.params.get('langs', 'en'))

            # Force FFMPEG backend
            cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG,
                                   [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE])

            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

            # State Machine
            active_event = None
            last_processed_img = None
            last_ocr_result = ("", 0.0)
            skipped_frames_count = 0

            # How many empty frames to tolerate before closing a subtitle
            # 5 frames at 25fps = 0.2s gap tolerance
            GAP_TOLERANCE = 5

            frame_idx = 0
            start_time = time.time()

            while self.is_running:
                ok, frame = cap.read()
                if not ok: break

                if self.cb.get('progress'):
                    elapsed = time.time() - start_time
                    eta_str = "--:--"
                    if frame_idx > 0:
                        avg_time = elapsed / frame_idx
                        remain = total_frames - frame_idx
                        eta_sec = int(remain * avg_time)
                        eta_str = f"{eta_sec // 60:02d}:{eta_sec % 60:02d}"
                    self.cb['progress'](frame_idx, total_frames, eta_str)

                current_ts = frame_idx / fps

                if frame_idx % step == 0:
                    # ROI Crop
                    h, w = frame.shape[:2]
                    if roi and roi[2] > 0:
                        y1, y2 = max(0, roi[1]), min(h, roi[1] + roi[3])
                        x1, x2 = max(0, roi[0]), min(w, roi[0] + roi[2])
                        frame_roi = frame[y1:y2, x1:x2]
                    else:
                        frame_roi = frame

                    if frame_roi.size > 0:
                        denoised = denoise_frame(frame_roi, strength=3)

                        # --- OCR Execution ---
                        run_ocr = True
                        if use_smart_skip:
                            diff = calculate_image_diff(denoised, last_processed_img)
                            if diff < 0.005 and last_processed_img is not None:
                                text, conf = last_ocr_result
                                skipped_frames_count += 1
                                run_ocr = False

                        if run_ocr:
                            processed = apply_clahe(denoised, clip_limit=clip_limit_val)
                            processed = cv2.resize(processed, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
                            final = apply_sharpening(processed)

                            try:
                                res = self.ocr_engine.predict(final)
                                text, conf = PaddleWrapper.parse_results(res, self.params['conf'])
                            except:
                                text, conf = "", 0.0

                            last_processed_img = denoised.copy()
                            last_ocr_result = (text, conf)

                        # --- Event Logic ---
                        is_valid_text = (text and conf >= min_conf)

                        if is_valid_text:
                            if active_event:
                                # Compare with active event
                                if is_similar(active_event.text, text, 0.6):
                                    # Same event continuing -> Extend it
                                    active_event.update(text, current_ts, conf)
                                else:
                                    # Totally new text -> Close old, Start new
                                    item = {'id': len(srt_data) + 1, 'start': active_event.start,
                                            'end': active_event.end,
                                            'text': active_event.text, 'conf': active_event.max_conf}
                                    srt_data.append(item)
                                    self._emit_subtitle(item)

                                    active_event = SubtitleEvent(text, current_ts, conf)
                            else:
                                # Start new event
                                active_event = SubtitleEvent(text, current_ts, conf)
                        else:
                            # No text seen this frame
                            if active_event:
                                active_event.gap_frames += 1
                                # Visual Cutoff Check: If enabled and scene changed drastically, close immediately
                                if use_visual_cutoff and last_processed_img is not None:
                                    # We compare current empty frame vs active event frame?
                                    # Simpler: just rely on gap tolerance unless diff is HUGE
                                    pass

                                if active_event.gap_frames > GAP_TOLERANCE:
                                    # Timeout -> Close Event
                                    item = {'id': len(srt_data) + 1, 'start': active_event.start,
                                            'end': active_event.end,
                                            'text': active_event.text, 'conf': active_event.max_conf}
                                    srt_data.append(item)
                                    self._emit_subtitle(item)
                                    active_event = None

                frame_idx += 1

            # Flush last event
            if active_event:
                item = {'id': len(srt_data) + 1, 'start': active_event.start, 'end': active_event.end,
                        'text': active_event.text, 'conf': active_event.max_conf}
                srt_data.append(item)
                self._emit_subtitle(item)

            cap.release()
            self._log(f"⚡ Smart Skip: {skipped_frames_count} frames")

            if self.params.get('use_llm', False) and srt_data:
                # ... (LLM Logic remains same) ...
                self._log("--- AI Editing ---")
                fixer = LLMFixer(self._log)
                repo = self.params.get('llm_repo', "bartowski/google_gemma-3-4b-it-GGUF")
                fname = self.params.get('llm_filename', "google_gemma-3-4b-it-Q4_K_M.gguf")
                prompt = self.params.get('llm_prompt', None)
                if fixer.load_model(repo, fname):
                    raw_langs = self.params.get('langs', 'en')
                    user_lang = raw_langs.replace(',', '+').split('+')[0].strip()
                    fixer.fix_subtitles(srt_data, lang=user_lang, prompt_template=prompt)
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
