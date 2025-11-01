#!/usr/bin/env python3
"""
Build script for TS_switcher extension
Creates ZIP archives for Chromium (Chrome/Edge/Opera) and Firefox
"""

import os
import shutil
import zipfile
from pathlib import Path

VERSION = "0.2"

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
        shutil.copy("manifest-firefox.json", os.path.join(temp_dir, "manifest.json"))
        shutil.copy("background-firefox.js", os.path.join(temp_dir, "background.js"))
        shutil.copy("popup.html", temp_dir)
        shutil.copy("popup.css", temp_dir)
        shutil.copy("popup.js", temp_dir)
        shutil.copy("content.js", temp_dir)
        shutil.copy("LICENSE", temp_dir)
        shutil.copytree("icons", os.path.join(temp_dir, "icons"))
        
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
