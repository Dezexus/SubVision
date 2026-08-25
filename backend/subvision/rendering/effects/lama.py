import logging
import threading
from typing import Dict, Any, List, Tuple
import cv2
import numpy as np

from subvision.rendering.effects.interface import Effect
from subvision.rendering.geometry import (
    calculate_text_roi,
    calculate_blur_roi,
    core_relative_to_blur,
    build_soft_core_mask,
)
from subvision.rendering.blend import pyramid_blend

logger = logging.getLogger(__name__)

try:
    import onnxruntime as ort
except ImportError as e:
    ort = None
    logger.error(f"Failed to import onnxruntime: {e}")

_lama_session = None
_lama_lock = threading.Lock()


def get_lama_session(model_path: str = "models/lama/lama.onnx"):
    """Global singleton for ONNX inference session."""
    global _lama_session
    if _lama_session is None and ort is not None:
        with _lama_lock:
            if _lama_session is None:
                available = ort.get_available_providers()
                providers = []
                if "CUDAExecutionProvider" in available:
                    providers.append(
                        (
                            "CUDAExecutionProvider",
                            {
                                "arena_extend_strategy": "kSameAsRequested",
                                "cudnn_conv_algo_search": "DEFAULT",
                                "do_copy_in_default_stream": True,
                            },
                        )
                    )
                providers.append("CPUExecutionProvider")

                sess_options = ort.SessionOptions()
                sess_options.enable_mem_pattern = False

                try:
                    _lama_session = ort.InferenceSession(model_path, sess_options=sess_options, providers=providers)
                    logger.info(f"LaMa ONNX model loaded with providers: {providers}")
                except Exception as e:
                    logger.error(f"Failed to load LaMa ONNX model: {e}")
                    raise
    return _lama_session


def _pad_to_multiple(img: np.ndarray, mask: np.ndarray, multiple: int = 8) -> Tuple[np.ndarray, np.ndarray, int, int]:
    """Pads image and mask to a multiple of a given size."""
    h, w = img.shape[:2]
    pad_h = (multiple - (h % multiple)) % multiple
    pad_w = (multiple - (w % multiple)) % multiple
    if pad_h == 0 and pad_w == 0:
        return img, mask, 0, 0
    img_padded = cv2.copyMakeBorder(img, 0, pad_h, 0, pad_w, cv2.BORDER_REFLECT)
    mask_padded = cv2.copyMakeBorder(mask, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=0)
    return img_padded, mask_padded, pad_h, pad_w


def apply_lama_inpaint(
    frame: np.ndarray,
    text_roi: Tuple[int, int, int, int],
    blur_settings: Dict[str, Any],
    blur_roi: Tuple[int, int, int, int] | None = None,
) -> np.ndarray:
    """LaMa inpaint on green soft-rect core; pyramid-blend through outer feather pad."""
    if ort is None:
        return frame
    try:
        session = get_lama_session()
        if session is None:
            return frame
    except Exception:
        return frame

    font_size_px = int(blur_settings.get("font_size", 21))
    feather = int(blur_settings.get("feather", 30))

    if blur_roi is None:
        tx, ty, tw, th = text_roi
        if tw <= 0 or th <= 0:
            return frame
        h, w = frame.shape[:2]
        pad_x = max(feather, int(font_size_px * 0.35))
        pad_y = max(feather, int(font_size_px * 0.25))
        bx = max(0, tx - pad_x)
        by = max(0, ty - pad_y)
        blur_roi = (bx, by, min(w, tx + tw + pad_x) - bx, min(h, ty + th + pad_y) - by)

    bx, by, bw, bh = blur_roi
    if bw <= 0 or bh <= 0:
        return frame

    core = core_relative_to_blur(text_roi, blur_roi)
    cx, cy, cw, ch = core
    if cw <= 0 or ch <= 0:
        return frame

    roi_slice = frame[by : by + bh, bx : bx + bw].copy()
    mask = np.zeros((bh, bw), dtype=np.uint8)
    mask[cy : cy + ch, cx : cx + cw] = 255

    roi_padded, mask_padded, pad_h, pad_w = _pad_to_multiple(roi_slice, mask, 8)

    img_tensor = (cv2.cvtColor(roi_padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0).transpose(2, 0, 1)
    img_tensor = np.expand_dims(img_tensor, 0)

    mask_tensor = mask_padded.astype(np.float32) / 255.0
    mask_tensor = np.expand_dims(np.expand_dims(mask_tensor, 0), 0)

    inputs = {session.get_inputs()[0].name: img_tensor, session.get_inputs()[1].name: mask_tensor}
    outputs = session.run(None, inputs)

    out_tensor = outputs[0][0]
    out_tensor = np.clip(out_tensor * 255, 0, 255).astype(np.uint8)
    out_img = cv2.cvtColor(out_tensor.transpose(1, 2, 0), cv2.COLOR_RGB2BGR)

    if pad_h > 0 or pad_w > 0:
        out_img = out_img[: out_img.shape[0] - pad_h, : out_img.shape[1] - pad_w]

    soft = build_soft_core_mask(bw, bh, core, feather, alpha=1.0)
    blended = pyramid_blend(roi_slice, out_img, soft)
    frame[by : by + bh, bx : bx + bw] = blended
    return frame


class LaMaInpaintEffect(Effect):
    """LaMa AI inpainting effect."""

    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.font_size_px = int(blur_settings.get("font_size", 21))
        self.frame_inpaint_map: Dict[int, List[Tuple[Tuple[int, int, int, int], Tuple[int, int, int, int]]]] = {}

    async def prepare(
        self,
        subtitles: List[Dict[str, Any]],
        width: int,
        height: int,
        fps: float,
        total_frames: int,
        video_path: str,
    ) -> None:
        """Initializes session and maps frames."""
        if self.blur_settings.get("mode") != "lama" or ort is None:
            self.frame_inpaint_map.clear()
            return

        self.frame_inpaint_map.clear()
        get_lama_session()

        for sub in subtitles:
            text = sub.get("text", "").strip()
            if not text:
                continue
            text_roi = calculate_text_roi(text, width, height, self.blur_settings)
            blur_roi = calculate_blur_roi(text, width, height, self.blur_settings)
            if text_roi[2] <= 0 or text_roi[3] <= 0 or blur_roi[2] <= 0 or blur_roi[3] <= 0:
                continue

            start_f = max(0, int(sub["start"] * fps) - 1)
            end_f = min(total_frames + 5, int(sub["end"] * fps) + 1)
            for f_idx in range(start_f, end_f):
                if f_idx not in self.frame_inpaint_map:
                    self.frame_inpaint_map[f_idx] = []
                self.frame_inpaint_map[f_idx].append((blur_roi, text_roi))

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        """Applies inpaint to target frames."""
        if frame_index not in self.frame_inpaint_map:
            return frame

        for blur_roi, text_roi in self.frame_inpaint_map[frame_index]:
            frame = apply_lama_inpaint(frame, text_roi, self.blur_settings, blur_roi)

        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        """Returns debug information."""
        return {"lama_inpaint_regions": len(self.frame_inpaint_map)}
