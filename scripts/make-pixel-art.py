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
COMMONS = "https://upload.wikimedia.org/wikipedia/commons"
# slug -> (Wikimedia Commons 960px thumb (all PD-Art or CC0), focal-x 0..1).
# focal-x centers the 4:5 crop on wide panels (0.5 = center). Every title in
# TITLES.painter / CHURCH_TITLES.painter is a real work with a source here;
# artists.check.ts fails on either half alone. Source shortlist (aspect
# ratios, benched works, why): docs/artifacts/painting-source-catalog.md.
SOURCES = {
    # Secular — TITLES.painter
    "allegory-of-spring": (f"{THUMB}/2/25/Sandro_Botticelli_-_La_Primavera_-_Google_Art_Project.jpg/960px-Sandro_Botticelli_-_La_Primavera_-_Google_Art_Project.jpg", 0.5),
    "the-birth-of-venus": (f"{THUMB}/0/0b/Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg/960px-Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg", 0.45),
    "lady-with-an-ermine": (f"{THUMB}/f/f9/Lady_with_an_Ermine_-_Leonardo_da_Vinci_-_Google_Art_Project.jpg/960px-Lady_with_an_Ermine_-_Leonardo_da_Vinci_-_Google_Art_Project.jpg", 0.5),
    "mona-lisa": (f"{THUMB}/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/960px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg", 0.5),
    "portrait-of-a-man-with-a-medal": (f"{THUMB}/b/b1/Sandro_Botticelli_-_Portrait_of_a_Man_with_a_Medal_of_Cosimo_the_Elder.jpg/960px-Sandro_Botticelli_-_Portrait_of_a_Man_with_a_Medal_of_Cosimo_the_Elder.jpg", 0.5),
    "an-old-man-and-his-grandson": (f"{THUMB}/c/c4/Ghirlandaio%2C_Domenico_-_An_Old_Man_and_His_Grandson_-_Louvre_-_Google_Art_Project.jpg/960px-Ghirlandaio%2C_Domenico_-_An_Old_Man_and_His_Grandson_-_Louvre_-_Google_Art_Project.jpg", 0.5),
    "portrait-of-baldassare-castiglione": (f"{THUMB}/9/94/Baldassare_Castiglione%2C_by_Raffaello_Sanzio%2C_from_C2RMF_retouched.jpg/960px-Baldassare_Castiglione%2C_by_Raffaello_Sanzio%2C_from_C2RMF_retouched.jpg", 0.5),
    "the-school-of-athens": (f"{THUMB}/c/c3/Raphael_School_of_Athens.jpg/960px-Raphael_School_of_Athens.jpg", 0.5),
    "the-tempest": (f"{THUMB}/f/fa/Giorgione%2C_The_tempest.jpg/960px-Giorgione%2C_The_tempest.jpg", 0.5),
    "pallas-and-the-centaur": (f"{THUMB}/d/de/Botticelli_Pallas_and_the_Centaur.jpg/960px-Botticelli_Pallas_and_the_Centaur.jpg", 0.5),
    # Most MET files of this panel are B&W study photos; DT711 is the color one.
    "a-goldsmith-in-his-shop": (f"{THUMB}/a/aa/A_Goldsmith_in_his_Shop_MET_DT711.jpg/960px-A_Goldsmith_in_his_Shop_MET_DT711.jpg", 0.5),
    "the-moneylender-and-his-wife": (f"{THUMB}/6/64/Massysm_Quentin_%E2%80%94_The_Moneylender_and_his_Wife_%E2%80%94_1514.jpg/960px-Massysm_Quentin_%E2%80%94_The_Moneylender_and_his_Wife_%E2%80%94_1514.jpg", 0.5),
    # Church — CHURCH_TITLES.painter
    "the-annunciation": (f"{THUMB}/9/93/Leonardo_da_Vinci_-_Annunciazione_-_Google_Art_Project.jpg/960px-Leonardo_da_Vinci_-_Annunciazione_-_Google_Art_Project.jpg", 0.82),
    # Botticelli's rectangular altar panel, not the Fra Angelico tondo it
    # replaced — a tondo file crops to a circle floating in white corners.
    "the-adoration-of-the-magi": (f"{THUMB}/9/9d/Botticelli_-_Adoration_of_the_Magi_%28Zanobi_Altar%29_-_Uffizi.jpg/960px-Botticelli_-_Adoration_of_the_Magi_%28Zanobi_Altar%29_-_Uffizi.jpg", 0.5),
    "saint-jerome-in-his-study": (f"{THUMB}/b/b1/Antonello_da_Messina_-_St_Jerome_in_his_study_-_National_Gallery_London.jpg/960px-Antonello_da_Messina_-_St_Jerome_in_his_study_-_National_Gallery_London.jpg", 0.5),
    "the-last-judgment": (f"{THUMB}/1/18/Last_Judgement_%28Michelangelo%29.jpg/960px-Last_Judgement_%28Michelangelo%29.jpg", 0.5),
    "the-madonna-of-the-goldfinch": (f"{THUMB}/5/57/Raffaello_Sanzio_-_Madonna_del_Cardellino_-_Google_Art_Project.jpg/960px-Raffaello_Sanzio_-_Madonna_del_Cardellino_-_Google_Art_Project.jpg", 0.5),
    "the-sistine-madonna": (f"{THUMB}/0/05/Raphael_-_The_Sistine_Madonna_-_Google_Arts_%26_Culture.jpg/960px-Raphael_-_The_Sistine_Madonna_-_Google_Arts_%26_Culture.jpg", 0.5),
    "the-lamentation-of-christ": (f"{THUMB}/b/b3/Andrea_Mantegna_-_Lamentation_of_Christ_-_Pinacoteca_di_Brera_%28Milan%29.jpg/960px-Andrea_Mantegna_-_Lamentation_of_Christ_-_Pinacoteca_di_Brera_%28Milan%29.jpg", 0.5),
    "the-baptism-of-christ": (f"{THUMB}/b/bc/Andrea_del_Verrocchio%2C_Leonardo_da_Vinci_-_Baptism_of_Christ_-_Uffizi.jpg/960px-Andrea_del_Verrocchio%2C_Leonardo_da_Vinci_-_Baptism_of_Christ_-_Uffizi.jpg", 0.5),
    "the-mystical-nativity": (f"{THUMB}/f/f8/Mystic_Nativity%2C_Sandro_Botticelli.jpg/960px-Mystic_Nativity%2C_Sandro_Botticelli.jpg", 0.5),
    "the-annunciation-with-saint-emidius": (f"{THUMB}/7/71/The_Annunciation%2C_with_Saint_Emidius_-_Carlo_Crivelli_-_National_Gallery.jpg/960px-The_Annunciation%2C_with_Saint_Emidius_-_Carlo_Crivelli_-_National_Gallery.jpg", 0.5),
    # 913px wide — under the 960 thumb width, so this one serves the original.
    "the-expulsion-from-the-garden-of-eden": (f"{COMMONS}/3/37/Masaccio-TheExpulsionOfAdamAndEveFromEden-Restoration.jpg", 0.5),
    "the-montefeltro-altarpiece": (f"{THUMB}/9/9e/Piero_della_Francesca_046.jpg/960px-Piero_della_Francesca_046.jpg", 0.5),
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
