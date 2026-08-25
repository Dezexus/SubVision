"""Multi-resolution blending helpers for soft effect seams."""

from __future__ import annotations

import cv2
import numpy as np


def _gaussian_pyramid(img: np.ndarray, levels: int) -> list[np.ndarray]:
    pyr = [img.astype(np.float32)]
    for _ in range(max(0, levels - 1)):
        h, w = pyr[-1].shape[:2]
        if h < 4 or w < 4:
            break
        pyr.append(cv2.pyrDown(pyr[-1]))
    return pyr


def _laplacian_pyramid(gauss_pyr: list[np.ndarray]) -> list[np.ndarray]:
    lap: list[np.ndarray] = []
    for i in range(len(gauss_pyr) - 1):
        size = (gauss_pyr[i].shape[1], gauss_pyr[i].shape[0])
        up = cv2.pyrUp(gauss_pyr[i + 1], dstsize=size)
        # pyrUp can be 1px off on odd sizes — resize to be safe.
        if up.shape[:2] != gauss_pyr[i].shape[:2]:
            up = cv2.resize(up, (gauss_pyr[i].shape[1], gauss_pyr[i].shape[0]), interpolation=cv2.INTER_LINEAR)
        lap.append(gauss_pyr[i] - up)
    lap.append(gauss_pyr[-1])
    return lap


def _collapse_laplacian(lap_pyr: list[np.ndarray]) -> np.ndarray:
    img = lap_pyr[-1]
    for i in range(len(lap_pyr) - 2, -1, -1):
        size = (lap_pyr[i].shape[1], lap_pyr[i].shape[0])
        img = cv2.pyrUp(img, dstsize=size)
        if img.shape[:2] != lap_pyr[i].shape[:2]:
            img = cv2.resize(img, size, interpolation=cv2.INTER_LINEAR)
        img = img + lap_pyr[i]
    return img


def pyramid_blend(original: np.ndarray, processed: np.ndarray, mask: np.ndarray, max_levels: int = 5) -> np.ndarray:
    """Blend processed over original using a Laplacian pyramid guided by mask.

    ``mask`` is float32 in [0, 1], weight of ``processed``. Single-channel HxW.
    """
    if original.shape != processed.shape:
        raise ValueError("original and processed must share shape")
    if mask.ndim != 2 or mask.shape[:2] != original.shape[:2]:
        raise ValueError("mask must be HxW matching image spatial size")

    h, w = mask.shape
    # Cap levels by image size.
    levels = 1
    dim = min(h, w)
    while levels < max_levels and dim >= 8:
        levels += 1
        dim //= 2

    if levels <= 1 or float(mask.max()) < 1e-4:
        m = mask.astype(np.float32)[..., None]
        out = processed.astype(np.float32) * m + original.astype(np.float32) * (1.0 - m)
        return np.clip(out, 0, 255).astype(np.uint8)

    mask_3 = np.repeat(mask.astype(np.float32)[:, :, None], 3, axis=2)
    gp_a = _gaussian_pyramid(original, levels)
    gp_b = _gaussian_pyramid(processed, levels)
    gp_m = _gaussian_pyramid(mask_3, levels)

    lp_a = _laplacian_pyramid(gp_a)
    lp_b = _laplacian_pyramid(gp_b)

    blended_lap: list[np.ndarray] = []
    for la, lb, gm in zip(lp_a, lp_b, gp_m):
        if gm.shape[:2] != la.shape[:2]:
            gm = cv2.resize(gm, (la.shape[1], la.shape[0]), interpolation=cv2.INTER_LINEAR)
        blended_lap.append(lb * gm + la * (1.0 - gm))

    out = _collapse_laplacian(blended_lap)
    return np.clip(out, 0, 255).astype(np.uint8)
