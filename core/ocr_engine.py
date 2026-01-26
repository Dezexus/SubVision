import numpy as np
import logging

try:
    import paddle
    from paddleocr import PaddleOCR
    # Отключаем избыточное логирование от PaddleOCR
    logging.getLogger("ppocr").setLevel(logging.ERROR)
except ImportError:
    pass

class PaddleWrapper:
    """
    Класс-обертка для упрощенной работы с движком PaddleOCR.
    """
    def __init__(self, lang='en', use_gpu=True):
        """
        Инициализирует движок PaddleOCR.

        Args:
            lang (str): Язык для распознавания ('en', 'ru', и т.д.).
            use_gpu (bool): Использовать ли GPU, если доступен.
        """
        self.use_gpu = use_gpu
        self._init_device()
        self.ocr = PaddleOCR(
            use_angle_cls=False,
            lang=lang
        )

    def _init_device(self):
        """Настраивает устройство (CPU/GPU) для PaddlePaddle."""
        try:
            if self.use_gpu and paddle.is_compiled_with_cuda():
                paddle.set_device('gpu')
            else:
                paddle.set_device('cpu')
        except Exception:
            # Игнорируем ошибки, если Paddle не установлен
            pass

    def predict(self, frame):
        """
        Выполняет распознавание текста на изображении.

        Args:
            frame (numpy.ndarray): Изображение для анализа.

        Returns:
            list: Сырые результаты распознавания от PaddleOCR.
        """
        return self.ocr.ocr(frame, cls=False)

    @staticmethod
    def parse_results(result_list, conf_thresh):
        """
        Обрабатывает сырые результаты от PaddleOCR.

        Фильтрует по уверенности, сортирует текст и объединяет его,
        возвращая строку и среднюю уверенность.

        Args:
            result_list (list): Результат от метода `predict`.
            conf_thresh (float): Порог уверенности для фильтрации.

        Returns:
            tuple: Кортеж (распознанный_текст, средняя_уверенность).
        """
        if not result_list or not result_list[0]:
            return "", 0.0

        valid_items = []
        # result_list[0] содержит список всех распознанных блоков
        for line in result_list[0]:
            box, (text, score) = line
            if score >= conf_thresh and text and len(str(text).strip()) > 0:
                valid_items.append((box, str(text).strip(), score))
        
        if not valid_items:
            return "", 0.0

        try:
            def get_center_y(box):
                # Считаем центр по высоте для сортировки строк
                return (box[0][1] + box[2][1]) / 2

            # Сортировка сверху вниз
            valid_items.sort(key=lambda x: get_center_y(x[0]))
            
            final_text = " ".join([t[1] for t in valid_items])
            avg_conf = sum([t[2] for t in valid_items]) / len(valid_items)
            
            return final_text, avg_conf
        except Exception:
            # Fallback на случай ошибок при сортировке
            texts = [t[1] for t in valid_items]
            scores = [t[2] for t in valid_items]
            return " ".join(texts), sum(scores) / len(scores) if scores else 0.0
