"""Deep-merge emotion analysis settings: env defaults < admin Redis < request."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional

from subvision.domain.emotion_models import EmotionAnalysisSettings


def _deep_merge(base: Dict[str, Any], patch: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not patch:
        return base
    out = deepcopy(base)
    for key, value in patch.items():
        if value is None:
            continue
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def merge_emotion_settings(
    env_defaults: EmotionAnalysisSettings,
    admin_patch: Optional[Dict[str, Any]] = None,
    request_patch: Optional[Dict[str, Any]] = None,
) -> EmotionAnalysisSettings:
    """Merge layers: env/static < admin < request."""
    merged = _deep_merge(env_defaults.model_dump(), admin_patch)
    merged = _deep_merge(merged, request_patch)
    return EmotionAnalysisSettings.model_validate(merged)


def settings_hash(settings: EmotionAnalysisSettings) -> str:
    """Stable hash for cache keys."""
    import hashlib
    import json

    payload = json.dumps(settings.model_dump(), sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]
