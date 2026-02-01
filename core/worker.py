import threading
import time
import gc
from .ocr_engine import PaddleWrapper
from .llm_engine import LLMFixer
# Импорт наших новых классов
from .video_provider import VideoProvider
from .image_pipeline import ImagePipeline
from .subtitle_aggregator import SubtitleAggregator


class OCRWorker(threading.Thread):
    def __init__(self, params, callbacks):
        super().__init__()
        self.params = params
        self.cb = callbacks
        self.is_running = True

    def stop(self):
        self.is_running = False

    def run(self):
        try:
            self.cb.get('log', lambda x: None)(f"--- START OCR ---")

            # 1. Инициализация компонентов
            video = VideoProvider(self.params['video_path'], step=self.params['step'])
            pipeline = ImagePipeline(
                roi=self.params['roi'],
                clahe_limit=self.params.get('clip_limit', 2.0),
                smart_skip_enabled=self.params.get('smart_skip', True)
            )
            aggregator = SubtitleAggregator(min_conf=self.params.get('min_conf', 0.80))

            # Подключаем колбэк для обновления UI
            aggregator.on_new_subtitle = self.cb.get('subtitle')

            ocr_engine = PaddleWrapper(lang=self.params.get('langs', 'en'))

            last_ocr_result = ("", 0.0)
            start_time = time.time()

            # 2. Главный цикл
            for frame_idx, timestamp, frame in video:
                if not self.is_running: break

                # Обновление прогресса
                self._update_progress(frame_idx, video.total_frames, start_time)

                # Обработка изображения
                final_img, skipped = pipeline.process(frame)

                if skipped:
                    # Если пропустили кадр, используем результат с прошлого раза
                    text, conf = last_ocr_result
                elif final_img is not None:
                    # Запускаем OCR
                    res = ocr_engine.predict(final_img)
                    text, conf = PaddleWrapper.parse_results(res, self.params['conf'])
                    last_ocr_result = (text, conf)
                else:
                    text, conf = "", 0.0

                # Агрегация субтитров
                aggregator.add_result(text, conf, timestamp)

            # 3. Финализация
            srt_data = aggregator.finalize()
            video.release()

            self.cb.get('log', lambda x: None)(f"⚡ Smart Skip: {pipeline.skipped_count} frames")

            # 4. Пост-обработка (AI)
            if self.params.get('use_llm', False) and srt_data:
                self._run_llm_fixer(srt_data)

            # 5. Сохранение
            self._save_to_file(srt_data)
            self.cb['finish'](True)

        except Exception as e:
            self.cb['finish'](False)
            # Log error...
        finally:
            # Очистка ресурсов...
            pass

    def _update_progress(self, current, total, start_time):
        if self.cb.get('progress'):
            elapsed = time.time() - start_time
            # ... расчет ETA ...
            self.cb['progress'](current, total, "ETA...")

    def _run_llm_fixer(self, srt_data):
        # Логика запуска LLM (вынесена в метод для чистоты)
        pass

    def _save_to_file(self, srt_data):
        # Логика записи файла
        pass
