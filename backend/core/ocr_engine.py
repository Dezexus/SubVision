"""
This module provides a wrapper class for the PaddleOCR library,
simplifying its initialization and result parsing. It checks for the
presence of the library and handles device selection (GPU/CPU).
"""
import logging
from typing import Any
import numpy as np

try:
    import paddle
    from paddleocr import PaddleOCR
    logging.getLogger("ppocr").setLevel(logging.ERROR)
    HAS_PADDLE = True
except ImportError:
    HAS_PADDLE = False
    PaddleOCR = object


class PaddleWrapper:
    """A wrapper for simplifying interaction with the PaddleOCR engine."""

    DET_PARAMS = {
        "det_limit_side_len": 2500,
        "det_limit_type": "max",
        "det_db_thresh": 0.3,
        "det_db_box_thresh": 0.6,
        "det_db_unclip_ratio": 1.5,
    }

    def __init__(self, lang: str = "en", use_gpu: bool = True) -> None:
        """
        Initializes the PaddleOCR engine with specified parameters.

        Args:
            lang: The language model to use for OCR.
            use_gpu: Whether to attempt using the GPU for computation.

        Raises:
            ImportError: If the PaddleOCR library is not installed.
        """
        if not HAS_PADDLE:
            raise ImportError("PaddleOCR is not installed.")

        self.use_gpu = use_gpu
        self._init_device()

        self.ocr = PaddleOCR(
            lang=lang,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            **self.DET_PARAMS,
        )

    def _init_device(self) -> None:
        """
        Sets the computation device for Paddle, preferring GPU if available
        and enabled, otherwise falling back to CPU.
        """
        if not self.use_gpu:
            paddle.set_device("cpu")
            return

        try:
            if paddle.is_compiled_with_cuda():
                paddle.set_device("gpu")
            else:
                paddle.set_device("cpu")
        except Exception as e:
            logging.warning(f"Failed to set Paddle device, falling back to CPU: {e}")
            paddle.set_device("cpu")

    def predict(self, frame: np.ndarray) -> Any:
        """
        Runs the OCR prediction on a single image frame.

        Args:
            frame: The input image as a NumPy array.

        Returns:
            The raw prediction result from the PaddleOCR engine.
        """
        return self.ocr.predict(frame)

    @staticmethod
    def parse_results(result_list: Any, conf_thresh: float) -> tuple[str, float]:
        """
        Parses the raw OCR results, filters by confidence, sorts vertically,
        and returns a combined string with the average confidence score.

        Args:
            result_list: The raw result object from the predict method.
            conf_thresh: The minimum confidence score to include a text box.

        Returns:
            A tuple containing the concatenated text string and the
            average confidence of the included texts.
        """
        if not result_list:
            return "", 0.0

        res_obj = result_list[0]
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

        valid_items: list[tuple[Any, str, float]] = []
        for i, raw_text in enumerate(texts_list):
            text = str(raw_text).strip()
            score = float(scores_list[i]) if i < len(scores_list) else 0.0
            if score >= conf_thresh and text:
                box = boxes_list[i] if i < len(boxes_list) else [[0, 0]]
                valid_items.append((box, text, score))

        if not valid_items:
            return "", 0.0

        try:
            valid_items.sort(key=lambda x: (x[0][0][1] + x[0][2][1]) / 2.0)
        except (IndexError, TypeError):
            pass

        final_texts = [item[1] for item in valid_items]
        final_scores = [item[2] for item in valid_items]

        avg_conf = sum(final_scores) / len(final_scores) if final_scores else 0.0
        return " ".join(final_texts), avg_conf
