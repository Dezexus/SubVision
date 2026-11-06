"""GigaAM checkpoint loading compatible with PyTorch >= 2.6.

PyTorch 2.6 switched ``torch.load`` to ``weights_only=True`` by default, which
rejects the omegaconf objects stored in the official GigaAM checkpoints. The
weights come from the vendor's official bucket, so we explicitly load this
trusted checkpoint with ``weights_only=False`` instead of allowlisting an
open-ended list of pickle globals.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator


@contextmanager
def _torch_load_full_checkpoints() -> Iterator[None]:
    import torch

    original_load = torch.load

    def patched_load(*args: Any, **kwargs: Any) -> Any:
        kwargs.setdefault("weights_only", False)
        return original_load(*args, **kwargs)

    torch.load = patched_load
    try:
        yield
    finally:
        torch.load = original_load


def load_gigaam_model(revision: str, download_root: str, **kwargs: Any) -> Any:
    """Load an official GigaAM model under PyTorch >= 2.6."""
    import gigaam

    with _torch_load_full_checkpoints():
        return gigaam.load_model(revision, download_root=download_root, **kwargs)
