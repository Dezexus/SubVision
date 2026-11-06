"""Download and optionally export GigaAM weights."""

from __future__ import annotations

import argparse
import ssl
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from subvision.processing.gigaam_loader import load_gigaam_model  # noqa: E402

DEFAULT_CACHE = Path(__file__).resolve().parents[1] / "uploads" / "models" / "gigaam"
MODEL_REVISION = "emo"


def _onnx_ready(onnx_dir: Path, revision: str) -> bool:
    """Check if ONNX artifacts exist."""
    if not onnx_dir.is_dir():
        return False
    return any(onnx_dir.glob("*.onnx")) or (onnx_dir / f"{revision}.yaml").is_file()


def _load_model(revision: str, cache_dir: Path):
    """Load GigaAM weights, tolerating the host's expired TLS certificate.

    The SberCloud bucket serving the weights periodically presents an expired
    certificate. Retry that specific failure without verification instead of
    silently shipping a worker without emotion weights.
    """
    try:
        return load_gigaam_model(revision, download_root=str(cache_dir))
    except urllib.error.URLError as exc:
        if not isinstance(getattr(exc, "reason", None), ssl.SSLCertVerificationError):
            raise
        print(
            f"WARNING: weight host certificate verification failed ({exc.reason}); "
            "retrying download without TLS verification.",
            file=sys.stderr,
        )
        original_context = ssl._create_default_https_context
        ssl._create_default_https_context = ssl._create_unverified_context
        try:
            return load_gigaam_model(revision, download_root=str(cache_dir))
        finally:
            ssl._create_default_https_context = original_context


def main() -> None:
    """Download weights and optionally export ONNX format."""
    parser = argparse.ArgumentParser(description="Cache GigaAM-Emo weights and optional ONNX.")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--revision", default=MODEL_REVISION)
    parser.add_argument("--export-onnx", action="store_true", help="Export ONNX after download")
    parser.add_argument(
        "--onnx-dtype",
        choices=("fp32", "fp16"),
        default="fp32",
        help="ONNX export precision",
    )
    args = parser.parse_args()

    import importlib.util

    if importlib.util.find_spec("gigaam") is None:
        print("gigaam is not installed — pip install gigaam", file=sys.stderr)
        sys.exit(1)

    cache_dir = args.cache_dir.resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)

    print(f"Downloading GigaAM ({args.revision}) -> {cache_dir}")
    model = _load_model(args.revision, cache_dir)
    print("PyTorch weights cached.")

    onnx_dir = cache_dir / "onnx"
    if args.export_onnx and not _onnx_ready(onnx_dir, args.revision):
        onnx_dir.mkdir(parents=True, exist_ok=True)
        print(f"Exporting ONNX -> {onnx_dir}")
        try:
            model.to_onnx(dir_path=str(onnx_dir))
            print("ONNX export complete.")
        except Exception as exc:
            print(f"ONNX export skipped: {exc}")
    elif args.export_onnx:
        print(f"ONNX already present in {onnx_dir}, skipping export.")


if __name__ == "__main__":
    main()
