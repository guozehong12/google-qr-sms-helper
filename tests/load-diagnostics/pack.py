#!/usr/bin/env python3
"""Build a deterministic diagnostic zip. The archive contains no original-extension files."""

import hashlib
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "load-diagnostics"
DIST = ROOT / "dist"
ZIP_NAME = "qr-helper-load-diagnostics-0.1.0.zip"
FILES = (
    "README.md",
    "content.js",
    "diagnose.js",
    "manifest.json",
    "popup.css",
    "popup.html",
    "popup.js",
    "service-worker.js",
)


def build(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w") as archive:
        for name in FILES:
            info = zipfile.ZipInfo(f"load-diagnostics/{name}", (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.flag_bits |= 0x800
            archive.writestr(info, (SOURCE / name).read_bytes())


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_outputs() -> str:
    archive = DIST / ZIP_NAME
    build(archive)
    digest = checksum(archive)
    (DIST / "SHA256SUMS.txt").write_text(f"{digest}  {ZIP_NAME}\n", encoding="utf-8")
    artifacts = Path("/opt/cursor/artifacts")
    if artifacts.is_dir():
        build(artifacts / ZIP_NAME)
        (artifacts / "SHA256SUMS.txt").write_text(f"{digest}  {ZIP_NAME}\n", encoding="utf-8")
    return digest


def check() -> None:
    archive = DIST / ZIP_NAME
    sums = DIST / "SHA256SUMS.txt"
    if not archive.is_file() or not sums.is_file():
        raise SystemExit("missing dist zip; run pack.py --write")
    temp = DIST / ".check-qr-helper-load-diagnostics.zip"
    build(temp)
    try:
        if temp.read_bytes() != archive.read_bytes():
            raise SystemExit("dist zip is stale; run pack.py --write")
        digest = checksum(archive)
        expected = f"{digest}  {ZIP_NAME}\n"
        if sums.read_text(encoding="utf-8") != expected:
            raise SystemExit("SHA256SUMS.txt does not match the zip")
    finally:
        temp.unlink(missing_ok=True)


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"--write", "--check"}:
        raise SystemExit("usage: pack.py --write|--check")
    if sys.argv[1] == "--write":
        print(write_outputs())
    else:
        check()
