#!/usr/bin/env python3
"""Pixelate public-domain paintings into public/art/<slug>.png.

Source images are Wikimedia Commons thumbnails of PD Renaissance works
(pre-1600 paintings; faithful photos of 2D PD art carry no new copyright).
Center-crops to 4:5 (the in-world canvas / DynamicTexture aspect), downscales
to 48x60, quantizes to 16 colors. Ship-size output: ~1-2 KB each.

Needs: pip install Pillow
Usage: python3 scripts/make-pixel-art.py   (re-downloads sources, idempotent)
Full recipe (source picking, wiring): docs/reference/art-pipelines.md
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

# ponytail: per-image 16-color quantize; switch to one shared palette
# (Image.quantize(palette=...)) if the gallery reads as a mismatched grab-bag.
W, H, COLORS = 48, 60, 16
OUT = Path(__file__).resolve().parent.parent / "public" / "art"
UA = {"User-Agent": "PatronageGame/0.1 (nmodi9@gmail.com)"}

THUMB = "https://upload.wikimedia.org/wikipedia/commons/thumb"
SOURCES = {
    # slug -> (Wikimedia Commons 960px thumb (all PD-Art), focal-x 0..1)
    # focal-x centers the 4:5 crop on wide panels (0.5 = center).
    "allegory-of-spring": (f"{THUMB}/2/25/Sandro_Botticelli_-_La_Primavera_-_Google_Art_Project.jpg/960px-Sandro_Botticelli_-_La_Primavera_-_Google_Art_Project.jpg", 0.5),
    "the-annunciation": (f"{THUMB}/9/93/Leonardo_da_Vinci_-_Annunciazione_-_Google_Art_Project.jpg/960px-Leonardo_da_Vinci_-_Annunciazione_-_Google_Art_Project.jpg", 0.82),
    "the-adoration-of-the-magi": (f"{THUMB}/d/d5/Fra_Angelico%2C_Fra_Filippo_Lippi%2C_The_Adoration_of_the_Magi.jpg/960px-Fra_Angelico%2C_Fra_Filippo_Lippi%2C_The_Adoration_of_the_Magi.jpg", 0.5),
    "portrait-of-a-young-merchant": (f"{THUMB}/d/d7/Portrait_of_a_Young_Man_MET_DP161258.jpg/960px-Portrait_of_a_Young_Man_MET_DP161258.jpg", 0.5),
}


def pixelate(img: Image.Image, focal_x: float = 0.5) -> Image.Image:
    img = img.convert("RGB")
    # crop to 4:5, horizontally centered on focal_x
    w, h = img.size
    target = W / H
    if w / h > target:
        cw = int(h * target)
        x0 = min(max(int(w * focal_x) - cw // 2, 0), w - cw)
        img = img.crop((x0, 0, x0 + cw, h))
    else:
        ch = int(w / target)
        img = img.crop((0, (h - ch) // 2, w, (h + ch) // 2))
    img = img.resize((W, H), Image.LANCZOS)
    return img.quantize(colors=COLORS, method=Image.MEDIANCUT)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, (url, focal_x) in SOURCES.items():
        req = urllib.request.Request(url, headers=UA)
        raw = urllib.request.urlopen(req, timeout=60).read()
        out = OUT / f"{slug}.png"
        pixelate(Image.open(io.BytesIO(raw)), focal_x).save(out, optimize=True)
        print(f"{out.name}: {out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
