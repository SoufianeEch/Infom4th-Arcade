"""Make a pygbag-generated page fit its frame (run by scripts/build-python-games.sh).

Stock pygbag pages start with a 1x1 canvas, assume 16:9 (fb_ar 1.77, 1280x720) and use only HALF of the available width
(gui_divider 2). Inside the arcade frame that shows a tiny square first and then a small, wrongly shaped canvas.
This sets the real game size (from the manifest's "aspect") and full width. Fails loudly if pygbag's template changes.
The page also gets shared/python-loader.css: a paper-style loading screen instead of pygbag's default green box.
Usage: python3 scripts/fit_pygbag_page.py games/<id>
"""
import json
import re
import sys
from pathlib import Path

game = Path(sys.argv[1])
manifest = json.loads((game / "manifest.json").read_text())
w, h = (int(float(x)) for x in str(manifest.get("aspect", "1000/640")).split("/"))
page = game / "web" / "index.html"
html = page.read_text()


def sub(pattern, repl, text):
    new, n = re.subn(pattern, repl, text, count=1)
    if n != 1:
        sys.exit(f"{page}: pygbag template changed, could not patch {pattern!r}")
    return new


html = sub(r"gui_divider\s*:\s*\d+", "gui_divider : 1", html)
html = sub(r"fb_ar\s*:\s*[\d.]+", f"fb_ar   :  {w / h:.4f}", html)
html = sub(r'fb_width\s*:\s*"\d+"', f'fb_width : "{w}"', html)
html = sub(r'fb_height\s*:\s*"\d+"', f'fb_height : "{h}"', html)
html = sub(r'(id="canvas"\s*)width="1px"(\s*)height="1px"', rf'\1width="{w}px"\2height="{h}px"', html)
html = sub(r"<style>html,body\{margin:0;", "<style>html,body{height:100%;overflow:hidden;margin:0;", html)
html = sub(r"</head>", '<link rel="stylesheet" href="/shared/python-loader.css"></head>', html)        # paper-style loading screen (shared/python-loader.css)
html = sub(r">Loading, please wait \.\.\.<", ">Loading…<", html)
page.write_text(html)
print(f"   fitted to {w}x{h} (aspect {w / h:.3f}), full width")
