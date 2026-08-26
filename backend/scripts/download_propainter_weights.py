#!/usr/bin/env python3
"""Download ProPainter pretrained weights into third_party/ProPainter/weights/."""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

WEIGHTS = (
    "raft-things.pth",
    "recurrent_flow_completion.pth",
    "ProPainter.pth",
)
BASE_URL = "https://github.com/sczhou/ProPainter/releases/download/v0.1.0/"
ROOT = Path(__file__).resolve().parents[1] / "third_party" / "ProPainter"


def _download(url: str, dest: Path) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"Downloading {url} -> {dest}")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dest)
    print(f"Saved {dest} ({dest.stat().st_size // (1024 * 1024)} MB)")


def main() -> None:
    if not ROOT.is_dir():
        print(f"ProPainter repo not found at {ROOT}", file=sys.stderr)
        print(
            "Clone: git clone --depth 1 https://github.com/sczhou/ProPainter.git third_party/ProPainter",
            file=sys.stderr,
        )
        sys.exit(1)

    weights_dir = ROOT / "weights"
    weights_dir.mkdir(parents=True, exist_ok=True)

    for name in WEIGHTS:
        path = weights_dir / name
        if path.is_file():
            print(f"Already present: {path}")
            continue
        _download(BASE_URL + name, path)


if __name__ == "__main__":
    main()
