"""
Defines processing presets and helper functions for the OCR configuration.
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
    Returns a full configuration dictionary for a given preset name.
    """
    config = DEFAULT_CONFIG.copy()
    delta = PRESETS_DELTAS.get(preset_name, {})
    config.update(delta)
    return config
