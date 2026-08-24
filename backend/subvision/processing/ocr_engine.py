import logging
import threading
from collections import OrderedDict
from typing import Any
import numpy as np

logger = logging.getLogger(__name__)

_MAX_ENGINE_CACHE = 3


class PaddleWrapper:
    DET_PARAMS = {
        "det_limit_side_len": 2500,
        "det_limit_type": "max",
        "det_db_thresh": 0.3,
        "det_db_box_thresh": 0.6,
        "det_db_unclip_ratio": 1.5,
        "rec_batch_num": 8,
    }

    def __init__(self, lang: str = "en", use_gpu: bool = True) -> None:
        self.use_gpu = use_gpu
        self._inference_lock = threading.Lock()
        self._batch_size = int(self.DET_PARAMS["rec_batch_num"])
        self._init_device()

        try:
            from paddleocr import PaddleOCR

            logging.getLogger("ppocr").setLevel(logging.ERROR)
        except ImportError:
            raise ImportError("PaddleOCR is not installed.")

        self.ocr = PaddleOCR(
            lang=lang,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            **self.DET_PARAMS,
        )

    def _init_device(self) -> None:
        try:
            import paddle
        except ImportError:
            return

        if not self.use_gpu:
            paddle.set_device("cpu")
            return

        try:
            if paddle.is_compiled_with_cuda():
                paddle.set_device("gpu")
            else:
                paddle.set_device("cpu")
        except Exception as e:
            logging.warning("Failed to set Paddle device, falling back to CPU: %s", e)
            paddle.set_device("cpu")

    def _predict_one(self, frame: np.ndarray, use_det: bool = True) -> Any:
        safe_frame = np.ascontiguousarray(frame)
        if hasattr(self.ocr, "predict"):
            return self.ocr.predict(safe_frame)
        if use_det:
            return self.ocr.ocr(safe_frame)
        return self.ocr.ocr(safe_frame, det=False, cls=False)

    def predict_batch(self, frames: list[np.ndarray], use_det: bool = True) -> list[Any]:
        if not frames:
            return []

        results: list[Any] = []
        with self._inference_lock:
            for start in range(0, len(frames), self._batch_size):
                chunk = frames[start : start + self._batch_size]
                for frame in chunk:
                    try:
                        results.append(self._predict_one(frame, use_det=use_det))
                    except Exception as e:
                        logging.error("OCR inference failed for frame: %s", e)
                        results.append(None)
        return results

    @staticmethod
    def parse_results(result_list: Any, conf_thresh: float) -> tuple[str, float]:
        if not result_list:
            return "", 0.0

        res_obj = result_list[0]
        if not res_obj:
            return "", 0.0

        if isinstance(res_obj, list):
            valid_items = []
            for line in res_obj:
                if not line or len(line) < 2:
                    continue
                box = line[0]
                text_tuple = line[1]
                if isinstance(text_tuple, (tuple, list)) and len(text_tuple) >= 2:
                    text_str = str(text_tuple[0]).strip()
                    score_val = float(text_tuple[1])
                    if score_val >= conf_thresh and text_str:
                        valid_items.append((box, text_str, score_val))
            if not valid_items:
                return "", 0.0
            try:
                valid_items.sort(key=lambda x: (x[0][0][1] + x[0][2][1]) / 2.0 if len(x[0]) >= 3 and len(x[0][0]) >= 2 and len(x[0][2]) >= 2 else 0)
            except (IndexError, TypeError):
                pass
            final_texts = [item[1] for item in valid_items]
            final_scores = [item[2] for item in valid_items]
            return " ".join(final_texts), min(final_scores)

        data: Any = res_obj.get("res", res_obj) if isinstance(res_obj, dict) else getattr(res_obj, "res", res_obj)
        if not data:
            return "", 0.0

        texts = data.get("rec_texts", []) if isinstance(data, dict) else getattr(data, "rec_texts", [])
        scores = data.get("rec_scores", []) if isinstance(data, dict) else getattr(data, "rec_scores", [])
        boxes = data.get("rec_boxes", []) if isinstance(data, dict) else getattr(data, "rec_boxes", [])

        if not texts:
            return "", 0.0

        texts_list = texts.tolist() if isinstance(texts, np.ndarray) else texts
        scores_list = scores.tolist() if isinstance(scores, np.ndarray) else scores
        boxes_list = boxes.tolist() if isinstance(boxes, np.ndarray) else boxes

        valid_items_dict: list[tuple[Any, str, float]] = []
        for i, raw_text in enumerate(texts_list):
            text = str(raw_text).strip()
            score = float(scores_list[i]) if i < len(scores_list) else 0.0
            if score >= conf_thresh and text:
                box = boxes_list[i] if i < len(boxes_list) else []
                valid_items_dict.append((box, text, score))

        if not valid_items_dict:
            return "", 0.0

        try:
            valid_items_dict.sort(key=lambda x: (x[0][0][1] + x[0][2][1]) / 2.0 if len(x[0]) >= 3 and len(x[0][0]) >= 2 and len(x[0][2]) >= 2 else 0)
        except (IndexError, TypeError):
            pass

        final_texts = [item[1] for item in valid_items_dict]
        final_scores = [item[2] for item in valid_items_dict]
        return " ".join(final_texts), min(final_scores)


_engine_lock = threading.Lock()
_engines: OrderedDict[tuple[str, bool], PaddleWrapper] = OrderedDict()


def get_paddle_engine(lang: str = "en", use_gpu: bool = True) -> PaddleWrapper:
    """Retrieve or create thread-safe OCR engine with LRU cache."""
    key = (lang, use_gpu)
    with _engine_lock:
        if key in _engines:
            _engines.move_to_end(key)
            return _engines[key]

        while len(_engines) >= _MAX_ENGINE_CACHE:
            _engines.popitem(last=False)

        engine = PaddleWrapper(lang=lang, use_gpu=use_gpu)
        _engines[key] = engine
        return engine
