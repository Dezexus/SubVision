"""Human-friendly export filenames based on the user's original upload name."""

from __future__ import annotations

import os
import re

_EXPORT_SAFE = re.compile(r"[^a-zA-Z0-9._\- ]+")


def export_stem(original_filename: str | None, storage_filename: str) -> str:
    """Base name without extension, safe for cache storage and download routes."""
    candidate = (original_filename or "").strip() or storage_filename
    base = os.path.splitext(os.path.basename(candidate))[0]
    cleaned = _EXPORT_SAFE.sub("_", base)
    cleaned = re.sub(r"_+", "_", cleaned).strip(" ._")
    return (cleaned[:200] if cleaned else "export")


def export_with_suffix(stem: str, suffix: str) -> str:
    """Build export filename: stem + suffix (e.g. '_emotion.json', '_blurred.mp4')."""
    if not suffix.startswith(("_", ".")):
        suffix = f"_{suffix}"
    full = f"{stem}{suffix}"
    cleaned = _EXPORT_SAFE.sub("_", full)
    cleaned = re.sub(r"_+", "_", cleaned).strip(" ._")
    return cleaned[:255] if cleaned else f"export{suffix}"
