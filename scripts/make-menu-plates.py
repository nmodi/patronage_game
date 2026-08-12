"""Main-menu blueprint plates: Palladio engravings -> tinted line-art SVGs.

Downloads four public-domain plate scans from Wikimedia Commons, thresholds
them to line art (a Gaussian blur first, where set, melts fine engraved
hatching into solid walls), traces with potrace, and recolors the fill to the
pale blueprint blue. Outputs land in public/menu/.

Requires: Pillow, potrace (brew install potrace).
"""
import re
import subprocess
import urllib.request
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).parent.parent
OUT = ROOT / "public" / "menu"
CACHE = Path(__file__).parent / "menu-plates"
CACHE.mkdir(exist_ok=True)

TINT = "#8fa3cf"  # pale blueprint line color; opacity is set in CSS

COMMONS = "https://upload.wikimedia.org/wikipedia/commons/"

# (url, out name, crop box as fractions l/t/r/b, threshold 0-255, max width px,
#  blur radius)
PLATES = [
    # Tempio della Fortuna Virile facade, I quattro libri (1570), Book 4
    (COMMONS + "0/09/TempioFortunaVirilePalladio.png",
     "palladio-temple", (0.02, 0.0, 0.98, 1.0), 132, 560, 0),
    # Villa La Rotonda half-elevation/half-section, Book 2 (plan half cropped off)
    (COMMONS + "7/7c/Palladio_La_Rotonda.png",
     "palladio-rotonda", (0.0, 0.63, 0.86, 0.985), 150, 553, 0.5),
    # Palazzo Thiene courtyard plan, Book 2 (facade half cropped off)
    (COMMONS + "thumb/5/54/Palais_Thiene.jpg/1280px-Palais_Thiene.jpg",
     "palladio-plan-square", (0.06, 0.02, 0.95, 0.62), 140, 900, 0),
    # Pantheon plan, Bertotti Scamozzi's engraved Palladio edition (1770s)
    (COMMONS + "thumb/d/d5/Pantheon_Palladio.jpg/1280px-Pantheon_Palladio.jpg",
     "palladio-plan-round", (0.05, 0.03, 0.95, 0.97), 175, 700, 2.0),
    # Villa La Rotonda cross plan — the other half of the elevation plate
    (COMMONS + "7/7c/Palladio_La_Rotonda.png",
     "palladio-plan-cross", (0.02, 0.0, 0.98, 0.625), 150, 553, 0.5),
    # Palazzo Iseppo Porto facade elevation, Book 2 (plan half cropped off)
    (COMMONS + "thumb/5/5a/Palais_Iseppo_Porto.jpg/1280px-Palais_Iseppo_Porto.jpg",
     "palladio-facade-porto", (0.02, 0.55, 0.98, 1.0), 140, 700, 0),
    # Palazzo Iseppo Porto plan — the other half of the facade plate
    (COMMONS + "thumb/5/5a/Palais_Iseppo_Porto.jpg/1280px-Palais_Iseppo_Porto.jpg",
     "palladio-plan-porto", (0.02, 0.0, 0.98, 0.54), 140, 700, 0),
    # Palazzo Thiene facade — the other half of the plan plate
    (COMMONS + "thumb/5/54/Palais_Thiene.jpg/1280px-Palais_Thiene.jpg",
     "palladio-facade-thiene", (0.03, 0.65, 0.97, 1.0), 140, 700, 0),
    # Corinthian capital study, I quattro libri (1570), Book 1
    (COMMONS + "thumb/4/40/13_-_palladio_capitello_1570.JPG/1280px-13_-_palladio_capitello_1570.JPG",
     "palladio-capital", (0.30, 0.58, 1.0, 1.0), 150, 450, 0.5),
    # Tuscan colonnade, I quattro libri
    (COMMONS + "f/f1/PalladioTuscan.jpg",
     "palladio-colonnade", (0.0, 0.0, 1.0, 0.98), 140, 451, 0),
]

for url, name, (l, t, r, b), thresh, maxw, blur in PLATES:
    src = CACHE / url.rsplit("/", 1)[-1]
    if not src.exists():
        print("fetch", url)
        # Commons 403s the default urllib User-Agent
        req = urllib.request.Request(url, headers={"User-Agent": "patronage-build/1.0"})
        src.write_bytes(urllib.request.urlopen(req).read())
    im = Image.open(src).convert("L")
    w, h = im.size
    im = im.crop((int(l * w), int(t * h), int(r * w), int(b * h)))
    if im.width > maxw:
        im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=1)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    bw = im.point(lambda p: 0 if p < thresh else 255, "1")
    pbm = CACHE / f"{name}.pbm"
    bw.save(pbm)
    svg = OUT / f"{name}.svg"
    subprocess.run(
        ["potrace", "--svg", "--turdsize", "6", "--output", str(svg), str(pbm)],
        check=True,
    )
    svg.write_text(re.sub(r'fill="#000000"', f'fill="{TINT}"', svg.read_text()))
    print(name, f"{svg.stat().st_size // 1024}KB", bw.size)
