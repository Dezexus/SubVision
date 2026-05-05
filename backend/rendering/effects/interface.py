from typing import Protocol, Any, Dict
import numpy as np

class Effect(Protocol):
    async def prepare(
        self,
        subtitles: list[dict[str, Any]],
        width: int,
        height: int,
        fps: float,
        total_frames: int,
        video_path: str,
    ) -> None:
        """Optional pre-processing step called once before frame iteration."""
        ...

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        """Apply the effect to a single frame."""
        ...

    def get_debug_info(self) -> Dict[str, Any]:
        """Return internal state for debugging, e.g. mask cache size."""
        return {}