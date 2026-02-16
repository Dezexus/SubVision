"""
This module defines processing presets and helper functions for the OCR configuration.
It provides a default configuration and deltas for different performance/quality trade-offs.
"""

ConfigType = dict[str, int | float | bool]

DEFAULT_CONFIG: ConfigType = {
    "step": 2,
    "min_conf": 80,
    "clahe": 2.0,
    "smart_skip": True,
    "visual_cutoff": True,
    "denoise_strength": 3,
    "scale_factor": 2.0,
}

PRESETS_DELTAS: dict[str, ConfigType] = {
    "⚖️ Balance": {
        "step": 2, "min_conf": 80, "clahe": 2.0, "denoise_strength": 3, "scale_factor": 2.0
    },
    "🏎️ Speed": {
        "step": 4, "min_conf": 70, "clahe": 1.0, "denoise_strength": 0, "scale_factor": 1.5
    },
    "🎯 Quality": {
        "step": 1, "min_conf": 85, "clahe": 2.5, "smart_skip": False, "denoise_strength": 5, "scale_factor": 2.5
    },
    "🔦 Hard / Low Quality": {
        "step": 2, "min_conf": 60, "clahe": 4.5, "denoise_strength": 7, "scale_factor": 3.0
    },
}

def get_preset_config(preset_name: str) -> ConfigType:
    """
    Returns a full configuration dictionary for a given preset name by merging
    the default config with the preset's specific overrides.
    """
    config = DEFAULT_CONFIG.copy()
    delta = PRESETS_DELTAS.get(preset_name, {})
    config.update(delta)
    return config

def get_preset_choices() -> list[str]:
    """Returns a list of available preset names."""
    return list(PRESETS_DELTAS.keys())

def get_preset_values(preset_name: str) -> tuple[int, int, float, bool, bool, bool]:
    """
    Returns a tuple of specific values from a preset's config for UI compatibility.
    """
    cfg = get_preset_config(preset_name)
    is_upscale = float(cfg["scale_factor"]) > 1.0
    return (
        int(cfg["step"]), int(cfg["min_conf"]), float(cfg["clahe"]),
        bool(cfg["smart_skip"]), bool(cfg["visual_cutoff"]), is_upscale,
    )
