"""STTN subtitle removal (test mode): a video transformer repaints the text strip.

The model sees neighbouring frames, so its fill stays consistent over time and it
invents structure TELEA cannot. It runs once per cue on a strip around the text,
and only the masked pixels of its output reach the frame. Hybrid is the fallback
when no text mask can be built. Torch exists only in the worker image, so nothing
here may import it at module level.
"""

from __future__ import annotations

import functools
import hashlib
import logging
import os
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from subvision.core.config import settings
from subvision.core.video_io import iter_frames_range
from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint, _odd_kernel_size
from subvision.rendering.geometry import calculate_text_roi

logger = logging.getLogger(__name__)

Roi = Tuple[int, int, int, int]

WEIGHTS_URL = "https://raw.githubusercontent.com/YaoFANGUK/video-subtitle-remover/e109b9ddc1d0e8f153199dfa05c1d767546906d8/backend/models/sttn-auto/infer_model.pth"
WEIGHTS_SHA256 = "c8408c9dd1300bd7000ea3a81b8236db89d9c0f185837781e38283c1e464675b"

MODEL_WIDTH, MODEL_HEIGHT = 640, 120
NEIGHBOR_STRIDE = 5
REFERENCE_STEP = 10
# Encoded frames stay on the GPU at about 5 MB each, so long cues go through in parts.
MAX_FRAMES_PER_PASS = 200
MASK_SAMPLES = 6
# The model is trained on subtitles from whole frames scaled to its input, so it only
# recognises letters of about that size: a tighter crop leaves them on screen as a ghost.
STRIP_WIDTH_FONTS = 50.0
# Same quality as float32 in testing, at twice the speed and under half the memory.
USE_HALF_PRECISION = True

MASK_VOTE_RATIO = 0.6
# Text keeps its value between frames; textured background has edges but keeps changing.
MAX_TEXT_STD = 8.0
# Text leaves gaps between glyphs; a mask this dense is static texture, not text.
MAX_MASK_COVERAGE = 0.9
# Wide enough to take in the soft drop shadow, which is too faint to be voted in.
MASK_GROW = 0.7


@dataclass
class Cue:
    roi: Roi
    start_f: int
    end_f: int


@dataclass
class StripModel:
    region: Roi
    mask: np.ndarray
    fills: Dict[int, np.ndarray] = field(default_factory=dict)


def weights_path() -> Path:
    return Path(settings.cache_dir) / "models" / "sttn" / "infer_model.pth"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_weights() -> Path:
    """Download the pinned weights once. A file with the wrong hash is never loaded."""
    path = weights_path()
    if path.exists() and _sha256(path) == WEIGHTS_SHA256:
        return path

    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(".part")
    logger.info("Downloading STTN weights to %s", path)
    urllib.request.urlretrieve(WEIGHTS_URL, partial)
    if _sha256(partial) != WEIGHTS_SHA256:
        partial.unlink(missing_ok=True)
        raise RuntimeError("Downloaded STTN weights failed the hash check.")
    os.replace(partial, path)
    return path


@functools.lru_cache(maxsize=1)
def load_generator() -> Tuple[Any, Any]:
    import torch

    from subvision.rendering.effects.sttn_network import InpaintGenerator

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    generator = InpaintGenerator()
    generator.load_state_dict(torch.load(ensure_weights(), map_location="cpu", weights_only=True)["netG"])
    return generator.to(device).eval(), device


def _decode(generator: Any, feats: Any, keep: int) -> Any:
    import torch

    return torch.tanh(generator.decoder(generator.transformer(feats)[:keep]))


def run_model(strips: List[np.ndarray]) -> List[np.ndarray]:
    """Repaint BGR strips of MODEL_WIDTH x MODEL_HEIGHT and return them in the same form."""
    import torch

    generator, device = load_generator()
    total = len(strips)
    rgb = np.stack([cv2.cvtColor(s, cv2.COLOR_BGR2RGB) for s in strips], axis=0)
    sums = np.zeros((total, MODEL_HEIGHT, MODEL_WIDTH, 3), dtype=np.float32)
    counts = np.zeros(total, dtype=np.float32)

    half = USE_HALF_PRECISION and device.type == "cuda"
    with torch.no_grad(), torch.autocast(device.type, dtype=torch.float16, enabled=half):
        tensors = torch.from_numpy(rgb).permute(0, 3, 1, 2).to(device=device, dtype=torch.float32) / 127.5 - 1.0
        feats = torch.cat([generator.encoder(part) for part in torch.split(tensors, 32)], dim=0)
        del tensors
        for center in range(0, total, NEIGHBOR_STRIDE):
            neighbors = list(range(max(0, center - NEIGHBOR_STRIDE), min(total, center + NEIGHBOR_STRIDE + 1)))
            references = [i for i in range(0, total, REFERENCE_STEP) if i not in neighbors]
            decoded = _decode(generator, feats[neighbors + references], len(neighbors))
            if not torch.isfinite(decoded).all():
                # float16 can still overflow on rare input, and NaN would turn pixels black.
                with torch.autocast(device.type, enabled=False):
                    decoded = _decode(generator, feats[neighbors + references].float(), len(neighbors))
            frames = ((decoded + 1.0) * 127.5).permute(0, 2, 3, 1).float().cpu().numpy()
            for frame, index in zip(frames, neighbors, strict=True):
                sums[index] += frame
                counts[index] += 1.0

    averaged = np.clip(sums / counts[:, None, None, None], 0, 255).astype(np.uint8)
    return [cv2.cvtColor(frame, cv2.COLOR_RGB2BGR) for frame in averaged]


def glyph_mask(gray: np.ndarray, font_size_px: int) -> np.ndarray:
    """Single-frame text candidates: edges, bright strokes and dark outlines."""
    h, w = gray.shape[:2]
    grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
    stroke_k = _odd_kernel_size(max(5, int(font_size_px * 0.5)), min(h, w))
    stroke = cv2.getStructuringElement(cv2.MORPH_RECT, (stroke_k, stroke_k))
    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, stroke)
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, stroke)
    return (((grad > 25) | (tophat > 25) | (blackhat > 25)).astype(np.uint8)) * 255


def stable_text_mask(grays: List[np.ndarray], font_size_px: int) -> np.ndarray:
    """Keep what stays in place across the cue, so moving background drops out."""
    votes = np.zeros(grays[0].shape, dtype=np.float32)
    for gray in grays:
        votes += glyph_mask(gray, font_size_px) > 0
    steady = np.std(np.stack(grays, axis=0).astype(np.float32), axis=0) < MAX_TEXT_STD
    mask = ((votes >= max(1.0, MASK_VOTE_RATIO * len(grays))) & steady).astype(np.uint8) * 255

    h, w = mask.shape[:2]
    close_k = _odd_kernel_size(max(3, int(font_size_px * 0.15)), min(h, w))
    dilate_k = _odd_kernel_size(max(5, int(font_size_px * MASK_GROW)), min(h, w))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_k, close_k)))
    return cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_k, dilate_k)))


def soft_alpha(mask: np.ndarray, font_size_px: int) -> np.ndarray:
    """Blend weights that reach 1 on the mask; growing first keeps the seam off the glyphs."""
    h, w = mask.shape[:2]
    k = _odd_kernel_size(max(3, int(font_size_px * 0.15)), min(h, w))
    grown = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    return np.maximum(cv2.GaussianBlur(grown, (k, k), 0), mask).astype(np.float32)[..., None] / 255.0


def strip_region(roi: Roi, frame_shape: Tuple[int, ...], font_size_px: int) -> Roi:
    """Strip around the text with the model's aspect ratio, sized to the font."""
    bx, by, bw, bh = roi
    frame_h, frame_w = frame_shape[:2]
    width = min(frame_w, max(int(font_size_px * STRIP_WIDTH_FONTS), bw + 2 * font_size_px))
    height = min(frame_h, max(int(round(width * MODEL_HEIGHT / MODEL_WIDTH)), bh + 2 * font_size_px))
    x = min(max(0, bx + bw // 2 - width // 2), frame_w - width)
    y = min(max(0, by + bh // 2 - height // 2), frame_h - height)
    return x, y, width, height


class STTNEffect:
    """Repaint each cue's strip once, then blend the masked part into every frame."""

    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.font_size_px = int(blur_settings.get("font_size", 21))
        self.video_path = ""
        self.frame_cues: Dict[int, List[Cue]] = {}
        self._models: Dict[Tuple[int, int, Roi], Optional[StripModel]] = {}

    def index_cues(self, subtitles: List[Dict[str, Any]], width: int, height: int, fps: float, total_frames: int, video_path: str) -> None:
        self.video_path = video_path
        fps = fps if fps > 0 else 25.0
        self.frame_cues.clear()
        self._models.clear()
        for sub in subtitles:
            text = str(sub.get("text", "")).strip()
            if not text:
                continue
            roi = calculate_text_roi(text, width, height, self.blur_settings)
            start_f = max(0, int(float(sub["start"]) * fps) - 1)
            end_f = min(total_frames, int(float(sub["end"]) * fps) + 1)
            if roi[2] <= 0 or roi[3] <= 0 or end_f <= start_f:
                continue
            cue = Cue(roi=roi, start_f=start_f, end_f=end_f)
            for f_idx in range(start_f, end_f):
                self.frame_cues.setdefault(f_idx, []).append(cue)

    async def prepare(self, subtitles: List[Dict[str, Any]], width: int, height: int, fps: float, total_frames: int, video_path: str) -> None:
        self.index_cues(subtitles, width, height, fps, total_frames, video_path)
        load_generator()
        logger.info("STTNEffect indexed %d frames", len(self.frame_cues))

    def _cue_mask(self, grays: List[np.ndarray], cue: Cue, region: Roi) -> Optional[np.ndarray]:
        """Stable text inside the ROI, or None when no usable mask exists."""
        # Votes run on the region so morphology has context, but only the ROI may be masked.
        mask = stable_text_mask(grays, self.font_size_px)
        keep = np.zeros_like(mask)
        ox, oy = cue.roi[0] - region[0], cue.roi[1] - region[1]
        # The ROI width is only an estimate, so text may run a little past its sides.
        side = self.font_size_px * 2
        keep[oy : oy + cue.roi[3], max(0, ox - side) : ox + cue.roi[2] + side] = 255
        mask = cv2.bitwise_and(mask, keep)
        coverage = cv2.countNonZero(mask) / float(cue.roi[2] * cue.roi[3])
        return None if coverage == 0.0 or coverage > MAX_MASK_COVERAGE else mask

    def _build_model(self, cue: Cue, frame_shape: Tuple[int, ...]) -> Optional[StripModel]:
        x, y, w, h = region = strip_region(cue.roi, frame_shape, self.font_size_px)
        span = cue.end_f - cue.start_f
        trim = span // 10
        sampled = {int(f) for f in np.linspace(cue.start_f + trim, cue.end_f - 1 - trim, num=min(MASK_SAMPLES, span))}

        indices: List[int] = []
        strips: List[np.ndarray] = []
        grays: List[np.ndarray] = []
        for f_idx, frame in iter_frames_range(self.video_path, cue.start_f, cue.end_f, correct_sar=False):
            crop = frame[y : y + h, x : x + w]
            indices.append(f_idx)
            strips.append(cv2.resize(crop, (MODEL_WIDTH, MODEL_HEIGHT), interpolation=cv2.INTER_AREA))
            if f_idx in sampled:
                grays.append(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY))
        if not grays:
            return None

        mask = self._cue_mask(grays, cue, region)
        if mask is None:
            return None

        model = StripModel(region=region, mask=mask)
        for start in range(0, len(strips), MAX_FRAMES_PER_PASS):
            part = slice(start, start + MAX_FRAMES_PER_PASS)
            # The model is trained on real subtitles, so it gets the frames as they are:
            # hiding the text first was measurably worse.
            model.fills.update(zip(indices[part], run_model(strips[part]), strict=True))
        return model

    def _model(self, cue: Cue, frame_shape: Tuple[int, ...]) -> Optional[StripModel]:
        key = (cue.start_f, cue.end_f, cue.roi)
        if key not in self._models:
            self._models[key] = self._build_model(cue, frame_shape)
        return self._models[key]

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        cues = self.frame_cues.get(frame_index)
        if not cues:
            return frame

        # Frames arrive in order, so finished cues can release their fills.
        for key in [k for k in self._models if k[1] <= frame_index]:
            del self._models[key]

        for cue in cues:
            model = self._model(cue, frame.shape)
            if model is None:
                frame = _apply_hybrid_inpaint(frame, cue.roi, self.font_size_px, blur_settings=self.blur_settings)
                continue
            nearest = min(model.fills, key=lambda f: abs(f - frame_index))
            x, y, w, h = model.region
            fill = cv2.resize(model.fills[nearest], (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32)
            alpha = soft_alpha(model.mask, self.font_size_px)
            frame[y : y + h, x : x + w] = (fill * alpha + frame[y : y + h, x : x + w] * (1.0 - alpha)).astype(np.uint8)
        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        return {"sttn_frames": len(self.frame_cues), "cached_cues": len(self._models)}
