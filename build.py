#!/usr/bin/env python3
"""
Build script for TS_switcher extension
Creates ZIP archives for Chromium (Chrome/Edge/Opera) and Firefox

This version is intended to be run from the repository root.
Source files for the extension live in the `src` directory.
"""

import os
import shutil
import zipfile
import json
from pathlib import Path

# Версия: из env VERSION (в CI — тег, напр. v0.3.2) или fallback
VERSION = os.environ.get("VERSION", "0.3.2").lstrip("v")

BASE_DIR = Path(__file__).resolve().parent
SRC_DIR = BASE_DIR / "src"


def update_manifest_versions():
    """Обновляет поле version в manifest.json и manifest-firefox.json до текущей VERSION."""
    manifest_paths = [
        SRC_DIR / "manifest.json",
        SRC_DIR / "manifest-firefox.json",
    ]
    for path in manifest_paths:
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            print(f"Warning: manifest not found: {path}")
            continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            print(f"Warning: could not parse {path}: {e}")
            continue
        if data.get("version") == VERSION:
            continue
        data["version"] = VERSION
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Updated version in {path} to {VERSION}")


def build_chromium():
    """Build Chromium version (Chrome, Edge, Opera)"""
    print("Creating Chromium version...")

    files = [
        "manifest.json",
        "popup.html",
        "popup.css",
        "popup.js",
        "content.js",
        "background.js",
        "LICENSE",
        "icons",
    ]

    versioned_name = BASE_DIR / f"TS_switcher-{VERSION}-chromium.zip"
    latest_name = BASE_DIR / "TS_switcher-chromium.zip"

    with zipfile.ZipFile(versioned_name, "w", zipfile.ZIP_DEFLATED) as zipf:
        for item in files:
            src_path = SRC_DIR / item
            if src_path.is_file():
                arcname = item
                zipf.write(src_path, arcname)
            elif src_path.is_dir():
                for root, dirs, files in os.walk(src_path):
                    for file in files:
                        file_path = Path(root) / file
                        arcname = os.path.relpath(file_path, SRC_DIR)
                        zipf.write(file_path, arcname)

    print(f"✓ Created {versioned_name.name}")

    shutil.copyfile(versioned_name, latest_name)
    print(f"✓ Created {latest_name.name}")


def build_firefox():
    """Build Firefox version with manifest V2"""
    print("Creating Firefox version...")

    # Create temporary directory in repo root
    temp_dir = BASE_DIR / "firefox_temp"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir()

    try:
        # Copy and rename files
        # Манифест должен ссылаться на background.js (файл переименован при сборке)
        manifest_src = SRC_DIR / "manifest-firefox.json"
        with open(manifest_src, "r", encoding="utf-8") as f:
            manifest_content = f.read().replace("background-firefox.js", "background.js")
        manifest_dest = temp_dir / "manifest.json"
        with open(manifest_dest, "w", encoding="utf-8") as f:
            f.write(manifest_content)

        shutil.copy(SRC_DIR / "background-firefox.js", temp_dir / "background.js")
        shutil.copy(SRC_DIR / "popup.html", temp_dir)
        shutil.copy(SRC_DIR / "popup.css", temp_dir)
        shutil.copy(SRC_DIR / "popup.js", temp_dir)
        shutil.copy(SRC_DIR / "content.js", temp_dir)
        shutil.copy(SRC_DIR / "LICENSE", temp_dir)

        icons_src = SRC_DIR / "icons"
        icons_dest = temp_dir / "icons"
        shutil.copytree(icons_src, icons_dest)

        versioned_name = BASE_DIR / f"TS_switcher-{VERSION}-firefox.zip"
        latest_name = BASE_DIR / "TS_switcher-firefox.zip"

        # Create ZIP
        with zipfile.ZipFile(versioned_name, "w", zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = Path(root) / file
                    arcname = os.path.relpath(file_path, temp_dir)
                    zipf.write(file_path, arcname)

        print(f"✓ Created {versioned_name.name}")

        shutil.copyfile(versioned_name, latest_name)
        print(f"✓ Created {latest_name.name}")

    finally:
        # Cleanup
        if temp_dir.exists():
            shutil.rmtree(temp_dir)


def main():
    print("Building TS_switcher extension...")
    print()

    # Sync manifest versions with VERSION
    update_manifest_versions()
    print()

    # Remove old archives from repository root
    for old_zip in BASE_DIR.glob("TS_switcher-*.zip"):
        try:
            os.remove(old_zip)
            print(f"Removed old {old_zip}")
        except PermissionError:
            print(f"Warning: Could not remove {old_zip} (file may be in use)")
        except OSError as e:
            print(f"Warning: Could not remove {old_zip}: {e}")
    print()

    # Build Chromium version
    build_chromium()
    print()

    # Build Firefox version
    build_firefox()
    print()

    print("Build complete! Files created in repository root:")
    print(f"  - TS_switcher-{VERSION}-chromium.zip (Chrome, Edge, Opera, versioned)")
    print("  - TS_switcher-chromium.zip (Chrome, Edge, Opera, latest)")
    print(f"  - TS_switcher-{VERSION}-firefox.zip (Firefox, versioned)")
    print("  - TS_switcher-firefox.zip (Firefox, latest)")
    print()
    print("Next steps:")
    print("  1. Test the extension in each browser")
    print("  2. Upload ZIP files to GitHub Releases")


if __name__ == "__main__":
    main()

