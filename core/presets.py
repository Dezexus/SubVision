# Presets configuration for video processing
# Format: "Name": (Step, MinConf, CLAHE, SmartSkip, VisualCutoff)

PRESETS_DATA = {
    "⚖️ Balance": (2, 80, 2.0, True, True),
    "🏎️ Speed": (4, 70, 1.0, True, False),
    "🎯 Quality": (1, 85, 2.5, False, True),
    "🔦 Hard / Low Quality": (2, 60, 4.5, True, False)
}

def get_preset_choices():
    """Returns a list of preset names."""
    return list(PRESETS_DATA.keys())

def get_preset_values(preset_name):
    """
    Returns a tuple of settings for the selected preset.
    Returns None if preset not found.
    """
    return PRESETS_DATA.get(preset_name, None)
