from typing import Any

ConfigType = dict[str, int | float | bool]

DEFAULT_CONFIG: ConfigType = {
    "step": 3,
    "min_conf": 82,
    "denoise_strength": 2,
    "scale_factor": 1.5,
    "smart_skip": True,
    "motion_mse_thresh": 22.0,
    "gap_tolerance": 3,
    "min_event_frames_mult": 1.5,
}

# Legacy UI / saved sessions that still send the old Mixed id.
_PRESET_ALIASES: dict[str, str] = {
    "🎬 Mixed": "⚖️ Balance",
}

PRESETS_DELTAS: dict[str, dict[str, Any]] = {
    "🎯 Quality": {
        "label": "Quality",
        "desc": "Frame-perfect timing",
        "config": {
            "step": 1,
            "min_conf": 85,
            "denoise_strength": 5,
            "scale_factor": 2.5,
            "smart_skip": False,
            "motion_mse_thresh": 12.0,
            "gap_tolerance": 5,
            "min_event_frames_mult": 2.0,
        },
    },
    "⚖️ Balance": {
        "label": "Balance",
        "desc": "Anime & live-action ROI",
        "config": {
            "step": 3,
            "min_conf": 82,
            "denoise_strength": 2,
            "scale_factor": 1.5,
            "smart_skip": True,
            "motion_mse_thresh": 22.0,
            "gap_tolerance": 3,
            "min_event_frames_mult": 1.5,
        },
    },
}

SUPPORTED_LANGUAGES: list[dict[str, str]] = [
    {"code": "en", "name": "English"},
    {"code": "ru", "name": "Russian"},
    {"code": "ch", "name": "Chinese"},
    {"code": "fr", "name": "French"},
    {"code": "german", "name": "German"},
    {"code": "korean", "name": "Korean"},
    {"code": "japan", "name": "Japanese"},
    {"code": "es", "name": "Spanish"},
]

_OVERRIDE_KEYS: tuple[str, ...] = (
    "step",
    "min_conf",
    "scale_factor",
    "denoise_strength",
    "smart_skip",
    "motion_mse_thresh",
    "gap_tolerance",
    "min_event_frames_mult",
)


def get_preset_config(preset_name: str) -> ConfigType:
    """Merge default config with preset specific deltas."""
    config = DEFAULT_CONFIG.copy()
    resolved = _PRESET_ALIASES.get(preset_name, preset_name)
    preset_data = PRESETS_DELTAS.get(resolved)
    if preset_data:
        config.update(preset_data.get("config", {}))
    return config


def resolve_config(params: dict[str, Any]) -> ConfigType:
    """Merge preset defaults with optional request overrides."""
    config = get_preset_config(str(params.get("preset", "⚖️ Balance")))

    if params.get("conf_threshold") is not None:
        config["min_conf"] = float(params["conf_threshold"])

    for key in _OVERRIDE_KEYS:
        if params.get(key) is not None:
            value = params[key]
            if key in ("step", "gap_tolerance"):
                config[key] = int(value)
            elif key == "smart_skip":
                config[key] = bool(value)
            else:
                config[key] = float(value)

    return config


def get_all_presets() -> list[dict[str, Any]]:
    """Return a list of all available presets with their full configurations."""
    presets_list = []
    for preset_id, preset_data in PRESETS_DELTAS.items():
        full_config = DEFAULT_CONFIG.copy()
        full_config.update(preset_data.get("config", {}))
        presets_list.append({"id": preset_id, "label": preset_data["label"], "desc": preset_data["desc"], "config": full_config})
    return presets_list


def get_supported_languages() -> list[dict[str, str]]:
    """Return a list of supported languages for OCR."""
    return SUPPORTED_LANGUAGES
