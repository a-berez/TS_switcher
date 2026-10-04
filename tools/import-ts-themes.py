"""Manually refresh the local TS palette snapshot; never run during build."""
import hashlib
import re
from datetime import date
from pathlib import Path
from urllib.request import urlopen

ORIGIN = "https://rating.chgk.info"

def main():
    html = urlopen(ORIGIN + "/", timeout=30).read().decode()
    asset = re.search(r'href="(/build/app\.[^" ]+\.css)"', html).group(1)
    url = ORIGIN + asset
    raw = urlopen(url, timeout=30).read()
    css = raw.decode()
    blocks = []
    for selector, body in re.findall(r"([^{}]+)\{([^{}]+)\}", css):
        if selector.startswith(":root") and ("--font-sans:" in body or "--bg-page:" in body):
            blocks.append(selector + " {\n  " + re.sub(r";(?=--|color-scheme:)", ";\n  ", body) + "\n}")
    if len(blocks) != 17:
        raise ValueError("Expected shared primitives and 16 palettes; inspect upstream CSS")
    header = f"/* TS palette snapshot: {url}\n   Retrieved {date.today().isoformat()}; SHA256 of full CSS: {hashlib.sha256(raw).hexdigest()}\n   Refresh: python tools/import-ts-themes.py then python tools/generate-themes.py */"
    Path(__file__).resolve().parents[1].joinpath("themes.css").write_text(header + "\n\n" + "\n\n".join(blocks) + "\n", encoding="utf-8")
    print(url)

if __name__ == "__main__":
    main()
