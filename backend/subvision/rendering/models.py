from typing import List, Dict, Any, Tuple
from pydantic import BaseModel, Field

from subvision.domain.models import BlurSettings

__all__ = ["BlurSettings", "RenderTaskConfig"]


class RenderTaskConfig(BaseModel):
    """Configuration for a video rendering task."""

    filename: str
    client_id: str
    blur_settings: BlurSettings
    subtitles: List[Dict[str, Any]]
    track_blur_settings: List[BlurSettings] = Field(default_factory=list)
    original_filename: str | None = None

    def settings_for_track(self, track: int) -> BlurSettings:
        if 0 <= track < len(self.track_blur_settings):
            return self.track_blur_settings[track]
        return self.blur_settings

    def build_effects(self, settings: BlurSettings | None = None) -> List[Any]:
        """Builds rendering effects for one track's settings (default: blur_settings)."""
        from subvision.rendering.effects.blur import BlurEffect
        from subvision.rendering.effects.inpainting import InpaintEffect

        settings = settings or self.blur_settings
        blur_dict = settings.model_dump()
        if settings.mode == "sttn":
            from subvision.rendering.effects.sttn import STTNEffect

            return [STTNEffect(blur_dict)]
        if settings.mode == "hybrid":
            # InpaintEffect already applies residual ring-blur; full-ROI BlurEffect
            # would soap the reconstructed background.
            return [InpaintEffect(blur_dict)]
        return [BlurEffect(blur_dict)]

    def build_track_effects(self) -> List[Tuple[Any, List[Dict[str, Any]]]]:
        """Effects per subtitle track, each paired with that track's subtitles."""
        by_track: Dict[int, List[Dict[str, Any]]] = {}
        for sub in self.subtitles:
            by_track.setdefault(int(sub.get("track") or 0), []).append(sub)
        if not by_track:
            by_track[0] = []
        return [(effect, subs) for track, subs in sorted(by_track.items()) for effect in self.build_effects(self.settings_for_track(track))]
