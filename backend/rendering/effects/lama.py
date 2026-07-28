import logging
import threading
from typing import Dict, Any, List, Tuple
import cv2
import numpy as np

from rendering.effects.interface import Effect
from rendering.geometry import calculate_text_roi
from rendering.effects.inpainting import generate_text_mask

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
                if 'CUDAExecutionProvider' in available:
                    providers.append(('CUDAExecutionProvider', {
                        'arena_extend_strategy': 'kSameAsRequested',
                        'cudnn_conv_algo_search': 'DEFAULT',
                        'do_copy_in_default_stream': True,
                    }))
                providers.append('CPUExecutionProvider')
                
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

def apply_lama_inpaint(frame: np.ndarray, roi: Tuple[int, int, int, int], font_size_px: int) -> np.ndarray:
    """Applies LaMa inpainting to a specific region."""
    x, y, w_roi, h_roi = roi
    if w_roi <= 0 or h_roi <= 0 or ort is None:
        return frame
    try:
        session = get_lama_session()
        if session is None:
            return frame
    except Exception:
        return frame

    bx, by, bw, bh = x, y, w_roi, h_roi
    pad = max(10, int(font_size_px * 0.5))
    h, w = frame.shape[:2]
    y1 = max(0, by - pad)
    y2 = min(h, by + bh + pad)
    x1 = max(0, bx - pad)
    x2 = min(w, bx + bw + pad)

    roi_expanded = frame[y1:y2, x1:x2].copy()
    mask = generate_text_mask(frame, (bx, by, bw, bh), font_size_px)
    
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    mask_dilated = cv2.dilate(mask, dilate_kernel)

    roi_padded, mask_padded, pad_h, pad_w = _pad_to_multiple(roi_expanded, mask_dilated, 8)
    
    img_tensor = (cv2.cvtColor(roi_padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0).transpose(2, 0, 1)
    img_tensor = np.expand_dims(img_tensor, 0)
    
    mask_tensor = (mask_padded.astype(np.float32) / 255.0)
    mask_tensor = np.expand_dims(np.expand_dims(mask_tensor, 0), 0)

    inputs = {
        session.get_inputs()[0].name: img_tensor,
        session.get_inputs()[1].name: mask_tensor
    }
    outputs = session.run(None, inputs)
    
    out_tensor = outputs[0][0]
    out_tensor = np.clip(out_tensor * 255, 0, 255).astype(np.uint8)
    out_img = cv2.cvtColor(out_tensor.transpose(1, 2, 0), cv2.COLOR_RGB2BGR)

    if pad_h > 0 or pad_w > 0:
        out_img = out_img[:out_img.shape[0]-pad_h, :out_img.shape[1]-pad_w]

    blend_k = max(9, int(font_size_px * 0.6)) | 1
    soft_mask = cv2.GaussianBlur(mask_dilated, (blend_k, blend_k), 0).astype(np.float32) / 255.0
    soft_mask_3ch = cv2.merge([soft_mask, soft_mask, soft_mask])

    inpainted_float = out_img.astype(np.float32)
    original_float = roi_expanded.astype(np.float32)

    blended = inpainted_float * soft_mask_3ch + original_float * (1.0 - soft_mask_3ch)
    frame[y1:y2, x1:x2] = blended.astype(np.uint8)

    return frame

class LaMaInpaintEffect(Effect):
    """LaMa AI inpainting effect."""
    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.font_size_px = int(blur_settings.get('font_size', 21))
        self.frame_inpaint_map: Dict[int, List[Tuple[Tuple[int, int, int, int], int]]] = {}

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
        if self.blur_settings.get('mode') != 'lama' or ort is None:
            self.frame_inpaint_map.clear()
            return

        self.frame_inpaint_map.clear()
        get_lama_session()

        for sub in subtitles:
            text = sub.get('text', '').strip()
            if not text:
                continue
            roi = calculate_text_roi(text, width, height, self.blur_settings)
            if roi[2] <= 0 or roi[3] <= 0:
                continue

            start_f = max(0, int(sub['start'] * fps) - 1)
            end_f = min(total_frames + 5, int(sub['end'] * fps) + 1)
            sub_id = sub.get('id', -1)
            for f_idx in range(start_f, end_f):
                if f_idx not in self.frame_inpaint_map:
                    self.frame_inpaint_map[f_idx] = []
                self.frame_inpaint_map[f_idx].append((roi, sub_id))

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        """Applies inpaint to target frames."""
        if frame_index not in self.frame_inpaint_map:
            return frame

        for roi, _ in self.frame_inpaint_map[frame_index]:
            frame = apply_lama_inpaint(frame, roi, self.font_size_px)

        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        """Returns debug information."""
        return {"lama_inpaint_regions": len(self.frame_inpaint_map)}