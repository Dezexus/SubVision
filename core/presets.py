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
        "step": 2,
        "min_conf": 80,
        "clahe": 2.0,
        "denoise_strength": 3,
        "scale_factor": 2.0,
    },
    "🏎️ Speed": {
        "step": 4,
        "min_conf": 70,
        "clahe": 1.0,
        "denoise_strength": 0,
        "scale_factor": 1.5,
    },
    "🎯 Quality": {
        "step": 1,
        "min_conf": 85,
        "clahe": 2.5,
        "smart_skip": False,
        "denoise_strength": 5,
        "scale_factor": 2.5,
    },
    "🔦 Hard / Low Quality": {
        "step": 2,
        "min_conf": 60,
        "clahe": 4.5,
        "denoise_strength": 7,
        "scale_factor": 3.0,
    },
}


def get_preset_config(preset_name: str) -> ConfigType:
    """Returns full configuration dictionary for a preset."""
    config = DEFAULT_CONFIG.copy()
    delta = PRESETS_DELTAS.get(preset_name, {})
    config.update(delta)
    return config


def get_preset_choices() -> list[str]:
    """Returns list of available presets."""
    return list(PRESETS_DELTAS.keys())


def get_preset_values(preset_name: str) -> tuple[int, int, float, bool, bool]:
    """Returns tuple values for UI compatibility."""
    cfg = get_preset_config(preset_name)
    return (
        int(cfg["step"]),
        int(cfg["min_conf"]),
        float(cfg["clahe"]),
        bool(cfg["smart_skip"]),
        bool(cfg["visual_cutoff"]),
    )
