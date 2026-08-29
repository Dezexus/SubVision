"""GigaAM-Emo inference with optional stub fallback."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from subvision.core.config import settings
from subvision.domain.emotion_models import EmotionExportSettings

logger = logging.getLogger(__name__)

_GIGAAM_AVAILABLE: Optional[bool] = None


def gigaam_available() -> bool:
    global _GIGAAM_AVAILABLE
    if _GIGAAM_AVAILABLE is None:
        try:
            import gigaam  # noqa: F401

            _GIGAAM_AVAILABLE = True
        except ImportError:
            _GIGAAM_AVAILABLE = False
    return _GIGAAM_AVAILABLE


def model_cache_path(cfg: EmotionExportSettings) -> Path:
    raw = Path(cfg.model_cache_dir)
    if raw.is_absolute():
        return raw
    base = Path(settings.cache_dir)
    if raw.parts and raw.parts[0] == base.name:
        return Path.cwd() / raw
    return base.parent / raw if base.name == "uploads" else Path.cwd() / raw


def onnx_cache_path(cfg: EmotionExportSettings) -> Path:
    return model_cache_path(cfg) / "onnx"


def model_weights_cached(cfg: Optional[EmotionExportSettings] = None) -> bool:
    """True if PyTorch or ONNX artifacts exist in cache dir."""
    cfg = cfg or EmotionExportSettings()
    cache = model_cache_path(cfg)
    if not cache.is_dir():
        return False
    if any(cache.glob("*.pt")) or any(cache.glob("*.pth")) or any(cache.glob("*.bin")):
        return True
    onnx = onnx_cache_path(cfg)
    return onnx.is_dir() and (any(onnx.glob("*.onnx")) or (onnx / f"{cfg.model_revision}.yaml").is_file())


def _backend_is_onnx(backend: str) -> bool:
    return backend.startswith("onnx_")


def _effective_torch_backend(backend: str) -> str:
    """Map onnx_* to torch_* — gigaam 0.1.0 has no ONNX inference for emo."""
    if backend == "onnx_cpu":
        return "torch_cpu"
    if backend == "onnx_cuda":
        return "torch_cuda"
    return backend


def _torch_device(backend: str) -> Optional[str]:
    backend = _effective_torch_backend(backend)
    if backend == "torch_cuda":
        return "cuda"
    if backend == "torch_cpu":
        return "cpu"
    return None


def _onnx_ready(onnx_dir: Path, revision: str) -> bool:
    if not onnx_dir.is_dir():
        return False
    return any(onnx_dir.glob("*.onnx")) or (onnx_dir / f"{revision}.yaml").is_file()


def _probs_from_onnx(raw: Any, labels: List[str]) -> Dict[str, float]:
    if isinstance(raw, dict):
        return {k: float(v) for k, v in raw.items()}
    try:
        import numpy as np

        arr = np.asarray(raw).reshape(-1)
    except Exception:
        return {lbl: 1.0 / len(labels) for lbl in labels}
    if arr.size == 0:
        return {lbl: 1.0 / len(labels) for lbl in labels}
    if arr.size == len(labels):
        total = float(arr.sum()) or 1.0
        return {labels[i]: float(arr[i]) / total for i in range(len(labels))}
    # softmax-style if logits
    import numpy as np

    ex = np.exp(arr - arr.max())
    probs = ex / ex.sum()
    return {labels[i]: float(probs[i]) for i in range(min(len(labels), probs.size))}


class EmotionEngine:
    """Lazy GigaAM-Emo wrapper (PyTorch or ONNX)."""

    def __init__(self, cfg: EmotionExportSettings) -> None:
        self.cfg = cfg
        self._model: Any = None
        self._backend: str = "stub"
        self._onnx_sessions: Any = None
        self._onnx_cfg: Any = None

    def _ensure_cache_dir(self) -> Path:
        cache = model_cache_path(self.cfg)
        cache.mkdir(parents=True, exist_ok=True)
        return cache

    def _load_torch(self, cache: Path) -> None:
        import gigaam

        requested = self.cfg.inference_backend
        effective = _effective_torch_backend(requested)
        if requested != effective:
            logger.warning(
                "GigaAM-Emo ONNX inference is not available in gigaam %s — using %s",
                getattr(gigaam, "__version__", "?"),
                effective,
            )
        device = _torch_device(requested)
        logger.info(
            "Loading GigaAM-Emo (torch) revision=%s device=%s (requested=%s)",
            self.cfg.model_revision,
            device,
            requested,
        )
        self._model = gigaam.load_model(
            self.cfg.model_revision,
            download_root=str(cache),
            device=device,
        )
        self._backend = "torch"

    def _load_model(self) -> None:
        if self._model is not None:
            return
        if not gigaam_available():
            logger.info("gigaam not installed — using stub emotion engine")
            self._model = "stub"
            self._backend = "stub"
            return
        cache = self._ensure_cache_dir()
        self._load_torch(cache)

    def analyze_wav(self, wav_path: Path) -> Dict[str, float]:
        self._load_model()
        if self._backend == "stub":
            return _stub_probs(wav_path, self.cfg.labels)
        probs = self._model.get_probs(str(wav_path))
        return {k: float(v) for k, v in probs.items()}

    def analyze_batch(self, wav_paths: List[Path]) -> List[Dict[str, float]]:
        return [self.analyze_wav(p) for p in wav_paths]


_ENGINE_CACHE: Dict[str, EmotionEngine] = {}


def get_engine_for_config(cfg: EmotionExportSettings) -> EmotionEngine:
    key = f"{cfg.model_revision}:{cfg.inference_backend}:{cfg.onnx_dtype}:{cfg.model_cache_dir}"
    if key not in _ENGINE_CACHE:
        _ENGINE_CACHE[key] = EmotionEngine(cfg)
    return _ENGINE_CACHE[key]


def get_emotion_engine(cache_key: str) -> EmotionEngine:
    """Backward-compatible helper."""
    del cache_key
    return get_engine_for_config(EmotionExportSettings())


def warm_emotion_model(cfg: Optional[EmotionExportSettings] = None) -> Tuple[bool, str]:
    """Pre-download / warm model weights. Returns (ok, message)."""
    cfg = cfg or EmotionExportSettings()
    if not cfg.analyze_emotion:
        return True, "emotion analysis disabled"
    if not gigaam_available():
        return False, "gigaam not installed"
    try:
        engine = get_engine_for_config(cfg)
        cache = engine._ensure_cache_dir()
        engine._load_model()
        cached = model_weights_cached(cfg)
        return True, f"ready ({engine._backend}) cache={cache} weights_cached={cached}"
    except Exception as exc:
        logger.exception("Emotion model warm-up failed")
        return False, str(exc)


def postprocess_emotion(
    probs: Dict[str, float],
    cfg: EmotionExportSettings,
) -> Dict[str, object]:
    if not probs:
        return {
            "primary": cfg.unknown_label,
            "confidence": 0.0,
            "probs": {lbl: 0.0 for lbl in cfg.labels},
        }
    canonical: Dict[str, float] = {lbl: 0.0 for lbl in cfg.labels}
    for k, v in probs.items():
        out_key = cfg.label_map.get(k, cfg.label_map.get(k.lower(), k))
        if out_key in canonical:
            canonical[out_key] += float(v)
    total = sum(canonical.values()) or 1.0
    normalized = {k: round(v / total, 6) for k, v in canonical.items()}
    primary = max(normalized, key=normalized.get)
    confidence = normalized[primary]
    if confidence < cfg.confidence_threshold:
        primary = cfg.unknown_label
    return {"primary": primary, "confidence": confidence, "probs": normalized}


def _stub_probs(wav_path: Path, labels: List[str]) -> Dict[str, float]:
    """Deterministic pseudo-probs for dev/tests when gigaam is absent."""
    digest = hashlib.sha256(str(wav_path).encode()).hexdigest()
    raw = [int(digest[i : i + 2], 16) + 1 for i in range(0, min(len(labels) * 2, len(digest) - 1), 2)]
    while len(raw) < len(labels):
        raw.append(1)
    total = float(sum(raw[: len(labels)]))
    return {labels[i]: raw[i] / total for i in range(len(labels))}
