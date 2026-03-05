#!/usr/bin/env python3
"""
Build script for TS_switcher extension
Creates ZIP archives for Chromium (Chrome/Edge/Opera) and Firefox
"""

import os
import shutil
import zipfile
from pathlib import Path

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

VERSION = "0.3.1"

def resize_icons_to_spec(icons_dir):
    """Приводит иконки к требуемым размерам (16, 48, 128) для AMO."""
    if not HAS_PIL:
        print("Warning: PIL not installed, skipping icon resize")
        return
    for filename in os.listdir(icons_dir):
        if not filename.endswith(".png"):
            continue
        target = None
        if "icon16" in filename:
            target = 16
        elif "icon48" in filename:
            target = 48
        elif "icon128" in filename:
            target = 128
        if not target:
            continue
        try:
            path = os.path.join(icons_dir, filename)
            img = Image.open(path)
            if img.mode != "RGBA":
                img = img.convert("RGBA")
            w, h = img.size
            if w != target or h != target:
                img = img.resize((target, target), Image.Resampling.LANCZOS)
                img.save(path, "PNG")
                print(f"  Resized {filename} to {target}x{target}")
        except Exception as e:
            print(f"  Warning: could not resize {filename}: {e}")

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
        "icons"
    ]
    
    with zipfile.ZipFile(f"TS_switcher-{VERSION}-chromium.zip", 'w', zipfile.ZIP_DEFLATED) as zipf:
        for item in files:
            if os.path.isfile(item):
                zipf.write(item)
            elif os.path.isdir(item):
                for root, dirs, files in os.walk(item):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = file_path
                        zipf.write(file_path, arcname)
    
    print(f"✓ Created TS_switcher-{VERSION}-chromium.zip")

def build_firefox():
    """Build Firefox version with manifest V2"""
    print("Creating Firefox version...")
    
    # Create temporary directory
    temp_dir = "firefox_temp"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)
    
    try:
        # Copy and rename files
        # Манифест должен ссылаться на background.js (файл переименован при сборке)
        with open("manifest-firefox.json", "r", encoding="utf-8") as f:
            manifest_content = f.read().replace("background-firefox.js", "background.js")
        with open(os.path.join(temp_dir, "manifest.json"), "w", encoding="utf-8") as f:
            f.write(manifest_content)
        shutil.copy("background-firefox.js", os.path.join(temp_dir, "background.js"))
        shutil.copy("popup.html", temp_dir)
        shutil.copy("popup.css", temp_dir)
        shutil.copy("popup.js", temp_dir)
        shutil.copy("content.js", temp_dir)
        shutil.copy("LICENSE", temp_dir)
        icons_dest = os.path.join(temp_dir, "icons")
        shutil.copytree("icons", icons_dest)
        resize_icons_to_spec(icons_dest)

        # Create ZIP
        with zipfile.ZipFile(f"TS_switcher-{VERSION}-firefox.zip", 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, temp_dir)
                    zipf.write(file_path, arcname)
        
        print(f"✓ Created TS_switcher-{VERSION}-firefox.zip")
        
    finally:
        # Cleanup
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

def main():
    print("Building TS_switcher extension...")
    print()
    
    # Remove old archives from parent directory
    parent_dir = Path('..')
    for old_zip in parent_dir.glob('TS_switcher-*.zip'):
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
    
    # Move to parent directory
    for zip_file in Path('.').glob('TS_switcher-*.zip'):
        shutil.move(str(zip_file), parent_dir / zip_file.name)
        print(f"Moved {zip_file} to parent directory")
    
    print()
    print("Build complete! Files created:")
    print(f"  - TS_switcher-{VERSION}-chromium.zip (Chrome, Edge, Opera)")
    print(f"  - TS_switcher-{VERSION}-firefox.zip (Firefox)")
    print()
    print("Next steps:")
    print("  1. Test the extension in each browser")
    print("  2. Create .crx file for Chrome using chrome://extensions/")
    print("  3. Upload to GitHub Releases")

if __name__ == "__main__":
    main()
