import numpy as np
import logging

try:
    import paddle
    from paddleocr import PaddleOCR

    # Отключаем избыточное логирование
    logging.getLogger("ppocr").setLevel(logging.ERROR)
except ImportError:
    pass


class PaddleWrapper:
    """
    Класс-обертка для работы с PaddleOCR v3.x.
    """

    def __init__(self, lang='en', use_gpu=True):
        self.use_gpu = use_gpu
        self._init_device()

        # ВАЖНО: Явно задаем параметры детекции.
        # det_limit_side_len=2500: позволяет обрабатывать изображения шириной до 2500px без сжатия.
        # Это сохраняет качество после Upscale x2.
        self.ocr = PaddleOCR(
            lang=lang,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            # Параметры детекции (исправляем сжатие до 64px)
            det_limit_side_len=2500,
            det_limit_type='max',
            det_db_thresh=0.3,
            det_db_box_thresh=0.6,
            det_db_unclip_ratio=1.5
        )

    def _init_device(self):
        try:
            if self.use_gpu and paddle.is_compiled_with_cuda():
                paddle.set_device('gpu')
            else:
                paddle.set_device('cpu')
        except Exception:
            pass

    def predict(self, frame):
        """
        Выполняет распознавание.
        """
        # Метод predict возвращает список объектов результатов
        return self.ocr.predict(frame)

    @staticmethod
    def parse_results(result_list, conf_thresh):
        """
        Парсит результаты (поддержка формата PaddleOCR v3).
        """
        if not result_list:
            return "", 0.0

        # Берем первый результат
        res_obj = result_list[0]

        # Данные могут быть внутри атрибута 'res', самого объекта или словаря
        data = None

        if isinstance(res_obj, dict):
            if 'res' in res_obj:
                data = res_obj['res']
            else:
                data = res_obj
        else:
            try:
                if hasattr(res_obj, 'res'):
                    data = res_obj.res
                elif hasattr(res_obj, 'rec_texts'):
                    data = res_obj
                else:
                    data = res_obj
            except:
                pass

        if not data:
            return "", 0.0

        # Извлекаем списки текстов и скоров
        try:
            texts = data['rec_texts'] if isinstance(data, dict) else getattr(data, 'rec_texts', [])
            scores = data['rec_scores'] if isinstance(data, dict) else getattr(data, 'rec_scores', [])
            boxes = data['rec_boxes'] if isinstance(data, dict) else getattr(data, 'rec_boxes', [])
        except:
            texts, scores, boxes = [], [], []

        valid_items = []

        if texts and len(texts) > 0:
            # Приводим numpy массивы к спискам, если нужно
            if isinstance(scores, np.ndarray):
                scores = scores.tolist()
            if isinstance(boxes, np.ndarray):
                boxes = boxes.tolist()

            for i, text in enumerate(texts):
                score = scores[i] if i < len(scores) else 0.0
                box = boxes[i] if i < len(boxes) else [[0, 0], [0, 0], [0, 0], [0, 0]]

                if score >= conf_thresh and text and str(text).strip():
                    valid_items.append((box, str(text).strip(), score))

        if not valid_items:
            return "", 0.0

        try:
            # Сортировка сверху вниз
            def get_center_y(box):
                if isinstance(box, np.ndarray):
                    box = box.tolist()
                return (box[0][1] + box[2][1]) / 2

            valid_items.sort(key=lambda x: get_center_y(x[0]))

            final_text = " ".join([t[1] for t in valid_items])
            avg_conf = sum([t[2] for t in valid_items]) / len(valid_items)

            return final_text, avg_conf
        except Exception:
            texts = [t[1] for t in valid_items]
            scores = [t[2] for t in valid_items]
            return " ".join(texts), sum(scores) / len(scores) if scores else 0.0
