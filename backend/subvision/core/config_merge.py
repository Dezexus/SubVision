"""Deep-merge emotion analysis settings: env defaults < admin Redis < request."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional

from subvision.domain.emotion_models import EmotionAnalysisSettings


def _deep_merge(base: Dict[str, Any], patch: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Recursively merge dictionary patches into base dictionary."""
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
    """Merge configuration layers with automatic schema version migration."""
    merged = _deep_merge(env_defaults.model_dump(), admin_patch)
    merged = _deep_merge(merged, request_patch)
    json_format = merged.get("json_format")
    if isinstance(json_format, dict):
        version = json_format.get("schema_version")
        if version is not None and version < 3:
            json_format["schema_version"] = 3
    return EmotionAnalysisSettings.model_validate(merged)


def settings_hash(settings: EmotionAnalysisSettings) -> str:
    """Compute stable hash for emotion analysis settings."""
    import hashlib
    import json

    payload = json.dumps(settings.model_dump(), sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]
