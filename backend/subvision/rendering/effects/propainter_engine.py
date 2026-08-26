"""ProPainter video inpainting engine (PyTorch, segment-based)."""

from __future__ import annotations

import logging
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

PROPAINTER_ROOT = Path(__file__).resolve().parents[3] / "third_party" / "ProPainter"
WEIGHTS_DIR = PROPAINTER_ROOT / "weights"
PRETRAIN_URL = "https://github.com/sczhou/ProPainter/releases/download/v0.1.0/"

_engine = None
_engine_lock = threading.Lock()
_last_inference_ms: float = 0.0
_TORCH_OK: Optional[bool] = None


def _ensure_propainter_path() -> None:
    root = str(PROPAINTER_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


def _check_torch() -> bool:
    global _TORCH_OK
    if _TORCH_OK is not None:
        return _TORCH_OK
    try:
        _ensure_propainter_path()
        import torch  # noqa: F401

        _TORCH_OK = True
    except ImportError:
        _TORCH_OK = False
    return _TORCH_OK


@dataclass
class ProPainterConfig:
    neighbor_length: int = 6
    ref_stride: int = 10
    subvideo_length: int = 30
    fp16: bool = True
    mask_dilation: int = 4
    raft_iter: int = 20


def is_propainter_available() -> bool:
    if not _check_torch() or not PROPAINTER_ROOT.is_dir():
        return False
    return all(
        (WEIGHTS_DIR / name).is_file()
        for name in ("ProPainter.pth", "raft-things.pth", "recurrent_flow_completion.pth")
    )


def get_last_inference_ms() -> float:
    return _last_inference_ms


def _resize_frames(frames: List[Image.Image], size: Optional[Tuple[int, int]] = None):
    if size is not None:
        out_size = size
        process_size = (out_size[0] - out_size[0] % 8, out_size[1] - out_size[1] % 8)
        frames = [f.resize(process_size) for f in frames]
    else:
        out_size = frames[0].size
        process_size = (out_size[0] - out_size[0] % 8, out_size[1] - out_size[1] % 8)
        if out_size != process_size:
            frames = [f.resize(process_size) for f in frames]
    return frames, process_size, out_size


def _binary_mask(mask: np.ndarray, th: float = 0.1) -> np.ndarray:
    out = mask.copy()
    out[out > th] = 1
    out[out <= th] = 0
    return out


def _read_masks(
    masks: List[np.ndarray],
    length: int,
    size: Tuple[int, int],
    flow_mask_dilates: int,
    mask_dilates: int,
):
    import scipy.ndimage

    flow_masks = []
    masks_dilated = []
    for mask_img in masks:
        pil = Image.fromarray(mask_img.astype(np.uint8))
        if size is not None:
            pil = pil.resize(size, Image.NEAREST)
        arr = np.array(pil.convert("L"))
        if flow_mask_dilates > 0:
            flow_mask_img = scipy.ndimage.binary_dilation(arr, iterations=flow_mask_dilates).astype(np.uint8)
        else:
            flow_mask_img = _binary_mask(arr).astype(np.uint8)
        flow_masks.append(Image.fromarray(flow_mask_img * 255))
        if mask_dilates > 0:
            arr = scipy.ndimage.binary_dilation(arr, iterations=mask_dilates).astype(np.uint8)
        else:
            arr = _binary_mask(arr).astype(np.uint8)
        masks_dilated.append(Image.fromarray(arr * 255))
    if len(masks) == 1:
        flow_masks = flow_masks * length
        masks_dilated = masks_dilated * length
    return flow_masks, masks_dilated


def _get_ref_index(mid_neighbor_id, neighbor_ids, length, ref_stride=10, ref_num=-1):
    ref_index = []
    if ref_num == -1:
        for i in range(0, length, ref_stride):
            if i not in neighbor_ids:
                ref_index.append(i)
    else:
        start_idx = max(0, mid_neighbor_id - ref_stride * (ref_num // 2))
        end_idx = min(length, mid_neighbor_id + ref_stride * (ref_num // 2))
        for i in range(start_idx, end_idx, ref_stride):
            if i not in neighbor_ids:
                if len(ref_index) > ref_num:
                    break
                ref_index.append(i)
    return ref_index


class ProPainterEngine:
    def __init__(self, fp16: bool = True) -> None:
        if not _check_torch():
            raise RuntimeError("PyTorch / ProPainter dependencies are not installed")
        _ensure_propainter_path()

        import torch
        from model.misc import get_device
        from model.modules.flow_comp_raft import RAFT_bi
        from model.propainter import InpaintGenerator
        from model.recurrent_flow_completion import RecurrentFlowCompleteNet

        self.torch = torch
        self.device = get_device()
        self.use_half = fp16 and self.device != torch.device("cpu")

        raft_path = WEIGHTS_DIR / "raft-things.pth"
        flow_path = WEIGHTS_DIR / "recurrent_flow_completion.pth"
        model_path = WEIGHTS_DIR / "ProPainter.pth"
        for p in (raft_path, flow_path, model_path):
            if not p.is_file():
                raise FileNotFoundError(f"ProPainter weight missing: {p}")

        self.fix_raft = RAFT_bi(str(raft_path), self.device)
        self.fix_flow_complete = RecurrentFlowCompleteNet(str(flow_path))
        for p in self.fix_flow_complete.parameters():
            p.requires_grad = False
        self.fix_flow_complete.to(self.device)
        self.fix_flow_complete.eval()
        self.model = InpaintGenerator(model_path=str(model_path)).to(self.device)
        self.model.eval()

        if self.use_half:
            self.fix_flow_complete = self.fix_flow_complete.half()
            self.model = self.model.half()

        logger.info("ProPainterEngine ready on %s (fp16=%s)", self.device, self.use_half)

    def inpaint(
        self,
        frames_bgr: List[np.ndarray],
        masks: List[np.ndarray],
        config: Optional[ProPainterConfig] = None,
    ) -> List[np.ndarray]:
        """Inpaint a clip; frames/masks must share the same H×W."""
        import time

        import torch
        from core.utils import to_tensors

        global _last_inference_ms
        if not frames_bgr:
            return []
        cfg = config or ProPainterConfig()
        t0 = time.perf_counter()

        frames_rgb = [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in frames_bgr]
        pil_frames = [Image.fromarray(f.astype(np.uint8), mode="RGB") for f in frames_rgb]

        frames_len = len(pil_frames)
        pil_frames, size, out_size = _resize_frames(pil_frames, None)
        flow_masks, masks_dilated = _read_masks(
            masks, frames_len, size, cfg.mask_dilation, cfg.mask_dilation
        )
        w, h = size

        frames_inp = [np.array(f).astype(np.uint8) for f in pil_frames]
        frames = to_tensors()(pil_frames).unsqueeze(0) * 2 - 1
        flow_masks_t = to_tensors()(flow_masks).unsqueeze(0)
        masks_dilated_t = to_tensors()(masks_dilated).unsqueeze(0)
        frames = frames.to(self.device)
        flow_masks_t = flow_masks_t.to(self.device)
        masks_dilated_t = masks_dilated_t.to(self.device)

        video_length = frames.size(1)
        with torch.no_grad():
            if frames.size(-1) <= 640:
                short_clip_len = 12
            elif frames.size(-1) <= 720:
                short_clip_len = 8
            elif frames.size(-1) <= 1280:
                short_clip_len = 4
            else:
                short_clip_len = 2

            if frames.size(1) > short_clip_len:
                gt_flows_f_list, gt_flows_b_list = [], []
                for f in range(0, video_length, short_clip_len):
                    end_f = min(video_length, f + short_clip_len)
                    if f == 0:
                        flows_f, flows_b = self.fix_raft(frames[:, f:end_f], iters=cfg.raft_iter)
                    else:
                        flows_f, flows_b = self.fix_raft(frames[:, f - 1 : end_f], iters=cfg.raft_iter)
                    gt_flows_f_list.append(flows_f)
                    gt_flows_b_list.append(flows_b)
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                gt_flows_bi = (torch.cat(gt_flows_f_list, dim=1), torch.cat(gt_flows_b_list, dim=1))
            else:
                gt_flows_bi = self.fix_raft(frames, iters=cfg.raft_iter)
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

            if self.use_half:
                frames = frames.half()
                flow_masks_t = flow_masks_t.half()
                masks_dilated_t = masks_dilated_t.half()
                gt_flows_bi = (gt_flows_bi[0].half(), gt_flows_bi[1].half())

            flow_length = gt_flows_bi[0].size(1)
            if flow_length > cfg.subvideo_length:
                pred_flows_f, pred_flows_b = [], []
                pad_len = 5
                for f in range(0, flow_length, cfg.subvideo_length):
                    s_f = max(0, f - pad_len)
                    e_f = min(flow_length, f + cfg.subvideo_length + pad_len)
                    pad_len_s = max(0, f) - s_f
                    pad_len_e = e_f - min(flow_length, f + cfg.subvideo_length)
                    pred_flows_bi_sub, _ = self.fix_flow_complete.forward_bidirect_flow(
                        (gt_flows_bi[0][:, s_f:e_f], gt_flows_bi[1][:, s_f:e_f]),
                        flow_masks_t[:, s_f : e_f + 1],
                    )
                    pred_flows_bi_sub = self.fix_flow_complete.combine_flow(
                        (gt_flows_bi[0][:, s_f:e_f], gt_flows_bi[1][:, s_f:e_f]),
                        pred_flows_bi_sub,
                        flow_masks_t[:, s_f : e_f + 1],
                    )
                    pred_flows_f.append(pred_flows_bi_sub[0][:, pad_len_s : e_f - s_f - pad_len_e])
                    pred_flows_b.append(pred_flows_bi_sub[1][:, pad_len_s : e_f - s_f - pad_len_e])
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                pred_flows_bi = (torch.cat(pred_flows_f, dim=1), torch.cat(pred_flows_b, dim=1))
            else:
                pred_flows_bi, _ = self.fix_flow_complete.forward_bidirect_flow(gt_flows_bi, flow_masks_t)
                pred_flows_bi = self.fix_flow_complete.combine_flow(gt_flows_bi, pred_flows_bi, flow_masks_t)
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

            masked_frames = frames * (1 - masks_dilated_t)
            subvideo_length_img_prop = min(100, cfg.subvideo_length)
            if video_length > subvideo_length_img_prop:
                updated_frames, updated_masks = [], []
                pad_len = 10
                for f in range(0, video_length, subvideo_length_img_prop):
                    s_f = max(0, f - pad_len)
                    e_f = min(video_length, f + subvideo_length_img_prop + pad_len)
                    pad_len_s = max(0, f) - s_f
                    pad_len_e = e_f - min(video_length, f + subvideo_length_img_prop)
                    b, t, _, _, _ = masks_dilated_t[:, s_f:e_f].size()
                    pred_flows_bi_sub = (
                        pred_flows_bi[0][:, s_f : e_f - 1],
                        pred_flows_bi[1][:, s_f : e_f - 1],
                    )
                    prop_imgs_sub, updated_local_masks_sub = self.model.img_propagation(
                        masked_frames[:, s_f:e_f],
                        pred_flows_bi_sub,
                        masks_dilated_t[:, s_f:e_f],
                        "nearest",
                    )
                    updated_frames_sub = frames[:, s_f:e_f] * (1 - masks_dilated_t[:, s_f:e_f]) + prop_imgs_sub.view(
                        b, t, 3, h, w
                    ) * masks_dilated_t[:, s_f:e_f]
                    updated_masks_sub = updated_local_masks_sub.view(b, t, 1, h, w)
                    updated_frames.append(updated_frames_sub[:, pad_len_s : e_f - s_f - pad_len_e])
                    updated_masks.append(updated_masks_sub[:, pad_len_s : e_f - s_f - pad_len_e])
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                updated_frames = torch.cat(updated_frames, dim=1)
                updated_masks = torch.cat(updated_masks, dim=1)
            else:
                b, t, _, _, _ = masks_dilated_t.size()
                prop_imgs, updated_local_masks = self.model.img_propagation(
                    masked_frames, pred_flows_bi, masks_dilated_t, "nearest"
                )
                updated_frames = frames * (1 - masks_dilated_t) + prop_imgs.view(b, t, 3, h, w) * masks_dilated_t
                updated_masks = updated_local_masks.view(b, t, 1, h, w)
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

        comp_frames: List[Optional[np.ndarray]] = [None] * video_length
        ori_frames = frames_inp
        neighbor_stride = max(1, cfg.neighbor_length // 2)
        ref_num = cfg.subvideo_length // cfg.ref_stride if video_length > cfg.subvideo_length else -1

        for f in range(0, video_length, neighbor_stride):
            neighbor_ids = list(range(max(0, f - neighbor_stride), min(video_length, f + neighbor_stride + 1)))
            ref_ids = _get_ref_index(f, neighbor_ids, video_length, cfg.ref_stride, ref_num)
            selected_imgs = updated_frames[:, neighbor_ids + ref_ids, :, :, :]
            selected_masks = masks_dilated_t[:, neighbor_ids + ref_ids, :, :, :]
            selected_update_masks = updated_masks[:, neighbor_ids + ref_ids, :, :, :]
            selected_pred_flows_bi = (
                pred_flows_bi[0][:, neighbor_ids[:-1], :, :, :],
                pred_flows_bi[1][:, neighbor_ids[:-1], :, :, :],
            )

            with torch.no_grad():
                l_t = len(neighbor_ids)
                pred_img = self.model(selected_imgs, selected_pred_flows_bi, selected_masks, selected_update_masks, l_t)
                pred_img = pred_img.view(-1, 3, h, w)
                pred_img = (pred_img + 1) / 2
                pred_img = pred_img.cpu().permute(0, 2, 3, 1).numpy() * 255
                binary_masks = (
                    masks_dilated_t[0, neighbor_ids, :, :, :].cpu().permute(0, 2, 3, 1).numpy().astype(np.uint8)
                )
                for i, idx in enumerate(neighbor_ids):
                    img = np.array(pred_img[i]).astype(np.uint8) * binary_masks[i] + ori_frames[idx] * (
                        1 - binary_masks[i]
                    )
                    if comp_frames[idx] is None:
                        comp_frames[idx] = img
                    else:
                        comp_frames[idx] = (
                            comp_frames[idx].astype(np.float32) * 0.5 + img.astype(np.float32) * 0.5
                        ).astype(np.uint8)
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        out_bgr: List[np.ndarray] = []
        target_w, target_h = out_size
        for f in comp_frames:
            if f is None:
                out_bgr.append(frames_bgr[len(out_bgr)])
                continue
            resized = cv2.resize(f, (target_w, target_h), interpolation=cv2.INTER_CUBIC)
            out_bgr.append(cv2.cvtColor(resized, cv2.COLOR_RGB2BGR))

        _last_inference_ms = (time.perf_counter() - t0) * 1000.0 / max(len(out_bgr), 1)
        return out_bgr


def get_propainter_engine(fp16: bool = True) -> Optional[ProPainterEngine]:
    global _engine
    if not is_propainter_available():
        return None
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _ensure_propainter_path()
                _engine = ProPainterEngine(fp16=fp16)
    return _engine
