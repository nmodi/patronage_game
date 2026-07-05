"""Retint Kenney fantasy-town colormap to Mediterranean palette.

Usage: python3 scripts/retint-colormap.py <src.png> <dst.png> [--desat]

Hue ranges (0-360), derived from sampling which pieces use which stripes:
- blues/purples/lavender (stone/plaster) -> warm sandstone/cream
- teal 158-190 (the kit's roof color)    -> terracotta
- green 130-158 (foliage)                -> olive/cypress green
- reds (fabric, red roofs)               -> terracotta
- oranges/browns (timber)                -> keep, slightly desaturate
"""
import colorsys
import sys
from PIL import Image, ImageEnhance

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
px = im.load()

for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = px[x, y]
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        hue = h * 360
        if 190 <= hue < 330:  # lavender/blue/magenta stone & plaster -> sandstone
            h = 40 / 360
            s = min(s, 0.24) * 0.85
            v = min(1.0, v * 1.12)
        elif 158 <= hue < 190:  # teal roofs -> terracotta
            h = 14 / 360
            s = min(s * 1.1, 0.68)
            v = min(1.0, v * 1.05)
        elif 130 <= hue < 158:  # foliage -> olive
            h = 85 / 360
            s = min(s * 0.8, 0.55)
            v = v * 0.95
        elif hue >= 330 or hue < 12:  # reds -> terracotta
            h = 16 / 360
            s = min(s * 0.95, 0.72)
            v = min(1.0, v * 1.02)
        elif 12 <= hue < 45 and s > 0.25:  # timber oranges: warm down a touch
            s = s * 0.88
        r2, g2, b2 = colorsys.hsv_to_rgb(h, s, v)
        px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)

if "--desat" in sys.argv:
    im = ImageEnhance.Color(im).enhance(0.25)
    im = ImageEnhance.Brightness(im).enhance(0.85)

im.save(dst)
print("wrote", dst)
