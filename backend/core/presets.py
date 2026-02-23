"""
Defines processing presets, supported languages, and helper functions for the OCR configuration.
"""
from typing import Any

ConfigType = dict[str, int | float | bool]

DEFAULT_CONFIG: ConfigType = {
    "step": 2,
    "min_conf": 80,
    "smart_skip": True,
    "denoise_strength": 3,
    "scale_factor": 2.0,
}

PRESETS_DELTAS: dict[str, dict[str, Any]] = {
    "⚖️ Balance": {
        "label": "Balanced",
        "desc": "Movies & TV Shows",
        "config": {"step": 2, "min_conf": 80, "denoise_strength": 3, "scale_factor": 2.0}
    },
    "🏎️ Speed": {
        "label": "Speed",
        "desc": "Draft / Clean video",
        "config": {"step": 4, "min_conf": 70, "denoise_strength": 0, "scale_factor": 1.5}
    },
    "🎯 Quality": {
        "label": "Quality",
        "desc": "Frame-perfect timing",
        "config": {"step": 1, "min_conf": 85, "smart_skip": False, "denoise_strength": 5, "scale_factor": 2.5}
    }
}

SUPPORTED_LANGUAGES: list[dict[str, str]] = [
    {"code": "en", "name": "English"},
    {"code": "ru", "name": "Russian"},
    {"code": "ch", "name": "Chinese"},
    {"code": "fr", "name": "French"},
    {"code": "german", "name": "German"},
    {"code": "korean", "name": "Korean"},
    {"code": "japan", "name": "Japanese"},
    {"code": "es", "name": "Spanish"}
]

def get_preset_config(preset_name: str) -> ConfigType:
    """
    Returns a full configuration dictionary for a given preset name.
    """
    config = DEFAULT_CONFIG.copy()
    preset_data = PRESETS_DELTAS.get(preset_name)
    if preset_data:
        config.update(preset_data.get("config", {}))
    return config

def get_all_presets() -> list[dict[str, Any]]:
    """
    Returns a list of all available processing presets.
    """
    presets_list = []
    for preset_id, preset_data in PRESETS_DELTAS.items():
        full_config = DEFAULT_CONFIG.copy()
        full_config.update(preset_data.get("config", {}))
        presets_list.append({
            "id": preset_id,
            "label": preset_data["label"],
            "desc": preset_data["desc"],
            "config": full_config
        })
    return presets_list

def get_supported_languages() -> list[dict[str, str]]:
    """
    Returns a list of all supported OCR languages.
    """
    return SUPPORTED_LANGUAGES
