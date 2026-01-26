import threading
import cv2
import traceback
import gc
from collections import Counter

from .ocr_engine import PaddleWrapper
from .image_ops import apply_gamma_correction
from .llm_engine import GemmaBatchFixer
from .utils import format_timestamp, is_similar, is_better_quality

class OCRWorker(threading.Thread):
    """
    Выполняет OCR видео в отдельном потоке, управляет созданием
    субтитров, стабилизацией текста и опциональной AI-коррекцией.
    """
    def __init__(self, params, callbacks):
        """
        Инициализирует воркер.

        Args:
            params (dict): Параметры для OCR (путь к видео, ROI, и т.д.).
            callbacks (dict): Словарь с callback-функциями (log, progress, finish).
        """
        super().__init__()
        self.params = params
        self.cb = callbacks
        self.is_running = True
        self.ocr_engine = None

    def stop(self):
        """Устанавливает флаг для безопасной остановки потока."""
        self.is_running = False

    def _log(self, msg):
        """Безопасно вызывает callback для логирования."""
        if self.cb.get('log'):
            self.cb['log'](msg)

    def _emit_subtitle(self, sub_item):
        """Безопасно вызывает callback для отправки нового субтитра."""
        if self.cb.get('subtitle'):
            self.cb['subtitle'](sub_item)

    def _emit_ai_update(self, sub_item):
        """Безопасно вызывает callback для отправки AI-исправлений."""
        if self.cb.get('ai_update'):
            self.cb['ai_update'](sub_item)

    def run(self):
        """
        Основной цикл обработки видео.

        Читает кадры, выполняет OCR, стабилизирует текст с помощью буфера,
        формирует временные метки, опционально исправляет текст через LLM
        и сохраняет результат в .srt файл.
        """
        srt_data = []
        try:
            self._log(f"--- ЗАПУСК OCR ---")
            step = self.params['step']
            roi = self.params['roi']
            video_path = self.params['video_path']
            gamma_val = self.params.get('gamma', 2.5)

            self.ocr_engine = PaddleWrapper(lang=self.params.get('langs', 'en'))
            device_name = "GPU" if self.ocr_engine.use_gpu else "CPU"
            self._log(f"Устройство: {device_name} | Gamma: {gamma_val}")
            self._log(f"Алгоритмы: Auto-Upscale")

            cap = cv2.VideoCapture(video_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

            current_start = None
            current_text = ""
            current_conf = 0.0
            frame_idx = 0
            subtitle_buffer = []
            MAX_BUFFER_SIZE = 5

            while self.is_running:
                ok, frame = cap.read()
                if not ok:
                    break
                
                if self.cb.get('progress') and frame_idx % 50 == 0:
                    self.cb['progress'](frame_idx, total_frames)
                
                current_ts = frame_idx / fps
                
                if frame_idx % step == 0:
                    h, w = frame.shape[:2]
                    if roi and roi[2] > 0:
                        y1, y2 = max(0, roi[1]), min(h, roi[1] + roi[3])
                        x1, x2 = max(0, roi[0]), min(w, roi[0] + roi[2])
                        frame_for_ocr = frame[y1:y2, x1:x2]
                    else:
                        frame_for_ocr = frame

                    if frame_for_ocr.size > 0:
                        processed = apply_gamma_correction(frame_for_ocr, gamma=gamma_val)
                        if processed.shape[0] < 80:
                            processed = cv2.resize(processed, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
                        
                        try:
                            res = self.ocr_engine.predict(processed)
                            text, conf = PaddleWrapper.parse_results(res, self.params['conf'])
                            text_res_tuple = (text, conf)
                        except Exception as e:
                            self._log(f"OCR Err: {e}")
                            text_res_tuple = ("", 0.0)

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

                        if is_similar(stable_text, current_text, 0.5):
                            if is_better_quality(stable_text, current_text):
                                current_text = stable_text
                                current_conf = stable_conf
                        else:
                            if current_text and current_conf >= 0.75:
                                buffer_lag = (len(subtitle_buffer) / 2) * (step / fps)
                                actual_end = max(current_start + 0.1, current_ts - buffer_lag)
                                item = {'id': len(srt_data) + 1, 'start': current_start, 'end': actual_end, 'text': current_text, 'conf': current_conf}
                                srt_data.append(item)
                                self._emit_subtitle(item)
                            elif current_text:
                                self._log(f"Пропуск (Low conf {int(current_conf * 100)}%): {current_text}")

                            if stable_text:
                                current_start, current_text, current_conf = current_ts, stable_text, stable_conf
                            else:
                                current_text, current_start, current_conf = "", None, 0.0
                
                frame_idx += 1

            if current_text and current_start and current_conf >= 0.75:
                item = {'id': len(srt_data) + 1, 'start': current_start, 'end': total_frames / fps, 'text': current_text, 'conf': current_conf}
                srt_data.append(item)
                self._emit_subtitle(item)
            elif current_text:
                self._log(f"Пропуск финальной (Low conf {int(current_conf * 100)}%): {current_text}")
            
            cap.release()
            
            if self.params.get('use_llm', False) and srt_data:
                self._log("--- ИИ Редактура (Gemma) ---")
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
                        f.write(f"{item['id']}\n{format_timestamp(item['start'])} --> {format_timestamp(item['end'])}\n{item['text']}\n\n")
                self._log(f"Сохранено: {self.params['output_path']}")
            except Exception as f_err:
                self._log(f"Ошибка сохранения: {f_err}")

            if self.ocr_engine:
                del self.ocr_engine
                self.ocr_engine = None
            
            gc.collect()
            try:
                import paddle
                paddle.device.cuda.empty_cache()
            except ImportError:
                pass
