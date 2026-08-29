#!/usr/bin/env python3
"""Download and optionally export GigaAM-Emo weights for the worker image."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

DEFAULT_CACHE = Path(__file__).resolve().parents[1] / "uploads" / "models" / "gigaam"
MODEL_REVISION = "emo"


def _onnx_ready(onnx_dir: Path, revision: str) -> bool:
    if not onnx_dir.is_dir():
        return False
    return any(onnx_dir.glob("*.onnx")) or (onnx_dir / f"{revision}.yaml").is_file()


def main() -> None:
    parser = argparse.ArgumentParser(description="Cache GigaAM-Emo weights (and optional ONNX).")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--revision", default=MODEL_REVISION)
    parser.add_argument("--export-onnx", action="store_true", help="Export ONNX after download")
    parser.add_argument(
        "--onnx-dtype",
        choices=("fp32", "fp16"),
        default="fp32",
        help="ONNX export precision (fp16 recommended for GPU)",
    )
    args = parser.parse_args()

    try:
        import gigaam
    except ImportError:
        print("gigaam is not installed — pip install gigaam", file=sys.stderr)
        sys.exit(1)

    cache_dir = args.cache_dir.resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)

    print(f"Downloading GigaAM ({args.revision}) -> {cache_dir}")
    model = gigaam.load_model(args.revision, download_root=str(cache_dir))
    print("PyTorch weights cached.")

    onnx_dir = cache_dir / "onnx"
    if args.export_onnx and not _onnx_ready(onnx_dir, args.revision):
        onnx_dir.mkdir(parents=True, exist_ok=True)
        print(f"Exporting ONNX -> {onnx_dir}")
        try:
            import torch

            dtype = torch.float16 if args.onnx_dtype == "fp16" else torch.float32
            model.to_onnx(dir_path=str(onnx_dir), dtype=dtype)
        except TypeError:
            # GigaAMEmo.to_onnx() may not accept dtype — export with defaults
            model.to_onnx(dir_path=str(onnx_dir))
        print("ONNX export complete.")
    elif args.export_onnx:
        print(f"ONNX already present in {onnx_dir}, skipping export.")


if __name__ == "__main__":
    main()
