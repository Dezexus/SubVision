"""Run each cv2.cuda path directly, bypassing the silent CPU fallbacks.

These only run where OpenCV has CUDA and a GPU (the worker container):
    docker exec -w /app/backend subvision_worker python -m pytest tests/test_cuda_paths.py
"""

import cv2
import numpy as np
import pytest

from subvision.core import motion
from subvision.core.gpu_utils import has_cuda
from subvision.rendering.effects import blur

pytestmark = pytest.mark.skipif(not has_cuda(), reason="needs OpenCV with CUDA and a GPU")


def _image(h=120, w=400):
    rng = np.random.default_rng(0)
    return cv2.GaussianBlur(rng.integers(0, 255, (h, w, 3), dtype=np.uint8), (9, 9), 3)


def test_cuda_denoise_matches_cpu():
    img = _image()
    gpu = cv2.cuda_GpuMat()
    gpu.upload(img)
    out = cv2.cuda.fastNlMeansDenoisingColored(gpu, 5.0, 5.0, search_window=21, block_size=7).download()
    ref = cv2.fastNlMeansDenoisingColored(img, None, 5.0, 5.0, 7, 21)
    assert out.shape == img.shape
    assert np.abs(out.astype(int) - ref.astype(int)).mean() < 4


def test_cuda_motion_detection_does_not_fall_back(monkeypatch):
    def no_cpu(_):
        raise AssertionError("motion detection fell back to CPU")

    monkeypatch.setattr(motion, "ensure_cpu", no_cpu)
    img = _image()
    assert motion.detect_change_absolute(img, np.roll(img, 40, axis=1)) is True


@pytest.mark.parametrize("feather,alpha", [(0, 1.0), (30, 1.0), (30, 0.6)])
def test_cuda_blur_matches_cpu(feather, alpha):
    frame = np.ascontiguousarray(np.tile(_image(), (4, 2, 1)))
    roi = (50, 200, 600, 200)
    bx, by, bw, bh = roi
    original = frame[by : by + bh, bx : bx + bw].copy()
    inner = blur.compute_feather_inner_roi(roi, feather) if feather else None

    gpu = blur._apply_cuda_blur(frame.copy(), roi, original, 5, feather, alpha, inner, None)
    cpu = blur._apply_cpu_blur(frame.copy(), roi, original, 5, feather, alpha, inner, None)
    assert np.abs(gpu.astype(int) - cpu.astype(int)).mean() < 1
