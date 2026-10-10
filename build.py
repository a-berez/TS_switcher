#!/usr/bin/env python3
"""Validate and package TS_switcher for Chromium and Firefox without editing src."""

import json
import os
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SRC_DIR = BASE_DIR / "src"
DEFAULT_VERSION = "1.1.0"
COMMON_FILES = (
    "fonts.css", "fonts/NotoSans-variable.ttf", "fonts/OFL-NotoSans.txt", "fonts/README.md",
    "popup.html", "popup.css", "popup.js", "options.html", "options.css",
    "theme.js", "theme-overrides.css", "options-theme.js", "popup-theme.js", "popup-themes.css", "options.js", "sites.js", "settings.js", "content.js", "LICENSE",
)
REQUIRED_ICONS = tuple(
    f"icons/icon{size}{suffix}.png"
    for size in (16, 48, 128)
    for suffix in ("", "_rating", "_disabled")
)


def numeric_version(version: str) -> tuple[int, int, int, int]:
    """Browser comparison pads omitted components with zero."""
    if not isinstance(version, str) or not re.fullmatch(r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){0,3}", version):
        raise ValueError(f"Invalid numeric manifest version: {version!r}")
    numbers = [int(part) for part in version.split(".")]
    if any(number > 65535 for number in numbers) or not any(numbers):
        raise ValueError(f"Invalid numeric manifest version: {version!r}")
    return tuple(numbers + [0] * (4 - len(numbers)))


def to_manifest_version(version: str) -> str:
    """Validate the release name before using it in manifest fields or file names."""
    match = re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-beta\.(0|[1-9][0-9]*))?", version)
    if not match:
        raise ValueError(f"Invalid release version: {version!r}; expected X.Y.Z[-beta.N]")
    major, minor, patch, beta = match.groups()
    numbers = [int(major), int(minor), int(patch)]
    if beta is not None:
        if not 1 <= int(beta) <= 65535:
            raise ValueError("Beta number must be between 1 and 65535")
        numbers.append(int(beta))
    result = ".".join(map(str, numbers))
    numeric_version(result)
    return result


def required_references(manifest: dict) -> set[str]:
    references = set(manifest["icons"].values()) | {manifest["options_ui"]["page"]}
    action = manifest.get("action", manifest.get("browser_action", {}))
    references.add(action["default_popup"])
    references.update(action["default_icon"].values())
    background = manifest["background"]
    references.update(background.get("scripts", []))
    if "service_worker" in background:
        references.add(background["service_worker"])
    for script in manifest.get("content_scripts", []):
        references.update(script.get("js", []))
        references.update(script.get("css", []))
    return references


def package_files(browser: str, manifest_version: str) -> dict[str, bytes]:
    manifest_name = "manifest-firefox.json" if browser == "firefox" else "manifest.json"
    background_name = "background-firefox.js" if browser == "firefox" else "background.js"
    manifest = json.loads((SRC_DIR / manifest_name).read_text(encoding="utf-8"))
    expected_mv = 2 if browser == "firefox" else 3
    if manifest.get("manifest_version") != expected_mv:
        raise ValueError(f"{manifest_name}: expected manifest_version {expected_mv}")
    source_version = manifest.get("version")
    if numeric_version(manifest_version) < numeric_version(source_version):
        raise ValueError(f"Refusing version downgrade in {manifest_name}: {source_version} -> {manifest_version}")
    manifest["version"] = manifest_version
    if browser == "firefox":
        manifest["background"]["scripts"] = [
            "background.js" if item == "background-firefox.js" else item
            for item in manifest["background"]["scripts"]
        ]
    # All mandatory assets are read before creating either archive. Missing
    # resources, including icons used only by the background, are hard failures.
    files = {name: (SRC_DIR / name).read_bytes() for name in (*COMMON_FILES, *REQUIRED_ICONS)}
    files["background.js"] = (SRC_DIR / background_name).read_bytes()
    files["manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    refs = required_references(manifest)
    for page in ("popup.html", "options.html"):
        refs.update(re.findall(r'(?:src|href)=[\"\']([^\"\'#]+)[\"\']', files[page].decode("utf-8")))
    missing = {ref for ref in refs if "://" not in ref and ref not in files}
    if missing:
        raise ValueError(f"{browser}: package references missing files: {sorted(missing)}")
    return files


def main():
    version = os.environ.get("VERSION", DEFAULT_VERSION)
    if version.startswith("v"):
        version = version[1:]
    manifest_version = to_manifest_version(version)
    packages = {browser: package_files(browser, manifest_version) for browser in ("chromium", "firefox")}
    # Unique staging avoids deleting shared directories. Validate and create all
    # ZIPs before replacing output, and keep archives from previous versions.
    with tempfile.TemporaryDirectory(prefix="ts-switcher-build-", dir=BASE_DIR) as temp:
        staging = Path(temp)
        for browser, files in packages.items():
            archive = staging / f"TS_switcher-{version}-{browser}.zip"
            with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
                for name, content in sorted(files.items()):
                    bundle.writestr(name, content)
            shutil.copyfile(archive, staging / f"TS_switcher-{browser}.zip")
        for archive in staging.iterdir():
            archive.replace(BASE_DIR / archive.name)
            print(f"Created {archive.name} (manifest {manifest_version})")


if __name__ == "__main__":
    main()
