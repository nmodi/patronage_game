#!/usr/bin/env python3
"""What colour is a Kenney kit piece, really?

Answers the question you must answer before replacing any kit piece with a
generated one (render/proceduralPieces.ts): the kit's "flat" colours are not
flat. The colormap is 16 unpadded 32px vertical gradient bands and every kit UV
is a *point* sample into one, so a wall's shading is a baked ambient-occlusion
ramp, not a colour. Sampling one pixel and calling it the piece's colour is how
proc:block first shipped walls that glowed.

Reads the GLB directly (no Blender, no node) and samples colormap.png at each
triangle's UV centroid, weighted by the triangle's world area — because triangle
*count* lies: a quoin is many small triangles, a wall is two big ones.

    # area-weighted colour histogram + overall average
    python3 scripts/sample-kit-colour.py wall-block.glb

    # the baked gradient, banded by height — this is the AO ramp to rebuild
    python3 scripts/sample-kit-colour.py wall-block.glb --by-height

    # only the stucco family (drop quoins, wood, glass)
    python3 scripts/sample-kit-colour.py wall-door.glb --family stucco

Needs Pillow. See docs/procedural-pieces.md and docs/kitbashing.md.
"""
import argparse
import collections
import json
import math
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TOWN = ROOT / "public/models/town"

# Colour families, as (name, predicate on (r,g,b)). These are the splits that
# matter when deciding what a generated piece must match.
FAMILIES = {
    # Kenney bakes salmon corner quoins onto the same material as the stucco —
    # the reason proc:block exists at all.
    "quoin": lambda r, g, b: r > 150 and (r - b) > 50 and g < r - 20,
    # Pale warm plaster, low saturation.
    "stucco": lambda r, g, b: r > 150 and (r - b) <= 50 and max(r, g, b) - min(r, g, b) <= 70,
    # Saturated red-orange roof tile.
    "tile": lambda r, g, b: r > 120 and (r - b) > 55 and (r - g) > 45,
}


def load_glb(path):
    data = path.read_bytes()
    if data[:4] != b"glTF":
        sys.exit(f"{path}: not a binary glTF")
    off, js, buf = 12, None, None
    while off < len(data):
        length, kind = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off : off + length]
        off += length
        if kind == 0x4E4F534A:
            js = json.loads(chunk)
        else:
            buf = chunk
    return js, buf


def accessor(js, buf, index):
    acc = js["accessors"][index]
    view = js["bufferViews"][acc["bufferView"]]
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    fmt = {5126: "f", 5123: "H", 5125: "I", 5121: "B", 5120: "b", 5122: "h"}[
        acc["componentType"]
    ]
    stride = view.get("byteStride") or struct.calcsize(fmt) * ncomp
    return [
        struct.unpack_from("<" + fmt * ncomp, buf, base + i * stride)
        for i in range(acc["count"])
    ]


def tri_area(a, b, c):
    u = [b[i] - a[i] for i in range(3)]
    v = [c[i] - a[i] for i in range(3)]
    cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
    ]
    return 0.5 * math.sqrt(sum(x * x for x in cross))


def triangles(js, buf, img):
    """Yield (colour, world_area, mid_height) per triangle."""
    w, h = img.size
    for mesh in js["meshes"]:
        for prim in mesh["primitives"]:
            attrs = prim["attributes"]
            if "TEXCOORD_0" not in attrs:
                continue
            uvs = accessor(js, buf, attrs["TEXCOORD_0"])
            pos = accessor(js, buf, attrs["POSITION"])
            idx = [i[0] for i in accessor(js, buf, prim["indices"])]
            for t in range(0, len(idx), 3):
                vs = idx[t : t + 3]
                u = sum(uvs[v][0] for v in vs) / 3
                v_ = sum(uvs[v][1] for v in vs) / 3
                px = img.getpixel(
                    (min(w - 1, int(u * w)), min(h - 1, int(v_ * h)))
                )
                area = tri_area(*[pos[v] for v in vs])
                if area <= 0:
                    continue
                yield px, area, sum(pos[v][1] for v in vs) / 3


def hexc(rgb):
    return "#%02x%02x%02x" % tuple(int(round(c)) for c in rgb)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("piece", help="GLB filename under public/models/town (or a path)")
    ap.add_argument("--colormap", default=str(TOWN / "Textures/colormap.png"))
    ap.add_argument("--family", choices=sorted(FAMILIES), help="only this colour family")
    ap.add_argument("--by-height", action="store_true", help="band by local Y — shows the baked gradient")
    ap.add_argument("--bands", type=int, default=4, help="height bands (default 4)")
    args = ap.parse_args()

    path = Path(args.piece)
    if not path.exists():
        path = TOWN / args.piece
    if not path.exists():
        sys.exit(f"no such piece: {args.piece}")

    js, buf = load_glb(path)
    img = Image.open(args.colormap).convert("RGB")
    keep = FAMILIES[args.family] if args.family else None

    tris = [
        (px, area, y)
        for px, area, y in triangles(js, buf, img)
        if keep is None or keep(*px)
    ]
    if not tris:
        sys.exit("no triangles matched")

    total = sum(a for _, a, _ in tris)
    avg = [sum(px[i] * a for px, a, _ in tris) / total for i in range(3)]

    print(f"{path.name}" + (f"  [{args.family} only]" if args.family else ""))
    print(f"  {len(tris)} triangles, area {total:.2f}")

    if args.by_height:
        # The gradient is what a generated piece must rebuild as vertex colours.
        lo = min(y for _, _, y in tris)
        hi = max(y for _, _, y in tris)
        span = (hi - lo) or 1
        bands = collections.defaultdict(lambda: [0.0, [0.0, 0.0, 0.0]])
        for px, area, y in tris:
            b = min(args.bands - 1, int((y - lo) / span * args.bands))
            bands[b][0] += area
            for i in range(3):
                bands[b][1][i] += px[i] * area
        print("  baked gradient, base -> top:")
        for b in sorted(bands):
            area, acc = bands[b]
            colour = [c / area for c in acc]
            ratio = [c / max(1e-6, t) for c, t in zip(colour, avg)]
            print(
                f"    y {lo + span * b / args.bands:5.2f}  {hexc(colour)}"
                f"  area {area:5.2f}  vs-avg {ratio[0]:.3f}"
            )
        base = bands[min(bands)][1]
        top = bands[max(bands)][1]
        ba = [c / bands[min(bands)][0] for c in base]
        ta = [c / bands[max(bands)][0] for c in top]
        print(f"  ramp: {hexc(ba)} -> {hexc(ta)}   per-channel ratio "
              + ", ".join(f"{b / max(1e-6, t):.3f}" for b, t in zip(ba, ta)))
    else:
        hist = collections.Counter()
        for px, area, _ in tris:
            hist[hexc(px)] += area
        for colour, area in hist.most_common(8):
            print(f"    {colour}  {100 * area / total:5.1f}%")

    print(f"  AREA-WEIGHTED AVERAGE  {hexc(avg)}")


if __name__ == "__main__":
    main()
