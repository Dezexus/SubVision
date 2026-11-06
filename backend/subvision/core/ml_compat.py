"""Compatibility shims for ML deps (PyTorch 2.6+)."""

from __future__ import annotations

import functools
from typing import Any

_torch_applied = False


def apply_torch_load_compat() -> None:
    """Legacy checkpoints (GigaAM) need weights_only=False on torch 2.6+."""
    global _torch_applied
    if _torch_applied:
        return
    try:
        import torch
    except ImportError:
        return

    original = torch.load

    @functools.wraps(original)
    def load_compat(*args: Any, **kwargs: Any):
        kwargs.setdefault("weights_only", False)
        return original(*args, **kwargs)

    torch.load = load_compat  # type: ignore[method-assign]
    _torch_applied = True


def apply_ml_compat() -> None:
    apply_torch_load_compat()
