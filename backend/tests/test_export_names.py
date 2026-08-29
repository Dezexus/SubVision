from subvision.core.export_names import export_stem, export_with_suffix


def test_export_stem_prefers_original():
    assert export_stem("My Clip.mp4", "a1b2c3d4.mp4") == "My Clip"


def test_export_stem_falls_back_to_storage():
    assert export_stem(None, "a1b2c3d4e5f6.mp4") == "a1b2c3d4e5f6"


def test_export_with_suffix():
    assert export_with_suffix("My Clip", "_emotion.json") == "My Clip_emotion.json"
    assert export_with_suffix("My Clip", "_blurred.mp4") == "My Clip_blurred.mp4"
