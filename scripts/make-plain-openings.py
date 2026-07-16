"""Extract the kit's standalone door leaf and shutters from their wall panels.

The Fantasy Town kit has no loose door/window props — every opening ships as a
full-cell *panel*: a thin slab on the +X face (x 0.42-0.47, y 0-1, z ±0.4) with
a 12-triangle **corner quoin** bar baked on at each z end. That's why panelled
buildings get quoins whether or not the facade wants them, and why two panels
meeting at a corner z-fight their quoins together.

But the two pieces worth having are already separable:

  door.glb     — wall-door.glb carries its door leaf as its own mesh + node
                 ("door", 196 tris, at [0.45, 0, -0.2]). No surgery at all:
                 point the scene at that node and drop the wall it hung on.
  shutters.glb — wall-window-shutters.glb welds its wall and window surround
                 into one island, but the shutter plate (112 tris, a 0.02-thick
                 leaf at y 0.30-0.70) is its own island. Selected as the only
                 island that doesn't reach the footing (y_min > 0.1) — the wall
                 and both quoins all span y 0-1.

Both keep their source coordinates, so they drop into the manifest at the same
`position` the old panel used. UVs/materials untouched (Kenney's swatch atlas).

Usage: python3 scripts/make-plain-openings.py
Writes public/models/town/door.glb and shutters.glb. Re-runnable.
"""
import json
import struct
from collections import defaultdict
from pathlib import Path

TOWN = Path(__file__).resolve().parent.parent / "public/models/town"
FOOTING_Y = 0.1  # islands reaching below this are wall/quoin, not a fitting


def load_glb(path: Path):
    data = path.read_bytes()
    jlen = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20 : 20 + jlen])
    boff = 20 + jlen
    blen = struct.unpack("<I", data[boff : boff + 4])[0]
    return gltf, bytearray(data[boff + 8 : boff + 8 + blen])


def write_glb(path: Path, gltf, bin_: bytearray):
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    bin_ += b"\x00" * (-len(bin_) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(bin_), 0x004E4942) + bytes(bin_)
    path.write_bytes(out)


def acc_off(gltf, idx):
    a = gltf["accessors"][idx]
    bv = gltf["bufferViews"][a["bufferView"]]
    return bv.get("byteOffset", 0) + a.get("byteOffset", 0), a


def read_vec(bin_, off, count, n):
    f = "<" + "f" * n
    return [list(struct.unpack_from(f, bin_, off + 4 * n * i)) for i in range(count)]


def islands(pos, idx):
    """Union-find over position-welded vertices; returns {root: [tri starts]}."""
    parent = list(range(len(pos)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    by_pos = defaultdict(list)
    for i, p in enumerate(pos):
        by_pos[tuple(round(c, 4) for c in p)].append(i)
    for group in by_pos.values():
        for i in group[1:]:
            union(group[0], i)
    for t in range(0, len(idx), 3):
        union(idx[t], idx[t + 1])
        union(idx[t], idx[t + 2])
    out = defaultdict(list)
    for t in range(0, len(idx), 3):
        out[find(idx[t])].append(t)
    return out


def make_door():
    """Keep only the 'door' node — its leaf mesh is already standalone."""
    gltf, bin_ = load_glb(TOWN / "wall-door.glb")
    node = next(n for n in gltf["nodes"] if n.get("name") == "door")
    mesh = gltf["meshes"][node["mesh"]]
    gltf["meshes"] = [mesh]
    gltf["nodes"] = [{**node, "mesh": 0, "name": "door"}]
    gltf["scenes"] = [{"nodes": [0]}]
    gltf["scene"] = 0
    write_glb(TOWN / "door.glb", gltf, bin_)
    return mesh


def make_shutters():
    """Rebuild a primitive from the one island that floats off the footing."""
    gltf, bin_ = load_glb(TOWN / "wall-window-shutters.glb")
    prim = gltf["meshes"][0]["primitives"][0]
    attrs = {k: prim["attributes"][k] for k in ("POSITION", "NORMAL", "TANGENT", "TEXCOORD_0")}
    data = {}
    for name, ai in attrs.items():
        off, a = acc_off(gltf, ai)
        n = {"VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        data[name] = read_vec(bin_, off, a["count"], n)
    i_off, i_acc = acc_off(gltf, prim["indices"])
    ifmt, isize = {5123: ("<H", 2), 5125: ("<I", 4)}[i_acc["componentType"]]
    idx = [struct.unpack_from(ifmt, bin_, i_off + isize * i)[0] for i in range(i_acc["count"])]

    pos = data["POSITION"]
    picked = [
        tris
        for tris in islands(pos, idx).values()
        if min(pos[idx[t + k]][1] for t in tris for k in range(3)) > FOOTING_Y
    ]
    assert len(picked) == 1, f"expected 1 floating island, got {len(picked)}"
    tris = picked[0]

    keep = sorted({idx[t + k] for t in tris for k in range(3)})
    remap = {v: i for i, v in enumerate(keep)}
    new_idx = [remap[idx[t + k]] for t in tris for k in range(3)]

    # Rebuild the buffer from scratch: one tightly-packed bufferView per attribute.
    out_bin, views, accessors, new_attrs = bytearray(), [], [], {}
    for name in attrs:
        vals = [data[name][v] for v in keep]
        n = len(vals[0])
        start = len(out_bin)
        for v in vals:
            out_bin += struct.pack("<" + "f" * n, *v)
        views.append({"buffer": 0, "byteOffset": start, "byteLength": len(out_bin) - start})
        acc = {
            "bufferView": len(views) - 1,
            "componentType": 5126,
            "count": len(vals),
            "type": {2: "VEC2", 3: "VEC3", 4: "VEC4"}[n],
        }
        if name == "POSITION":  # glTF requires min/max on POSITION
            acc["min"] = [min(v[d] for v in vals) for d in range(3)]
            acc["max"] = [max(v[d] for v in vals) for d in range(3)]
        accessors.append(acc)
        new_attrs[name] = len(accessors) - 1

    start = len(out_bin)
    for i in new_idx:
        out_bin += struct.pack("<H", i)
    views.append({"buffer": 0, "byteOffset": start, "byteLength": len(out_bin) - start})
    accessors.append(
        {"bufferView": len(views) - 1, "componentType": 5123, "count": len(new_idx), "type": "SCALAR"}
    )

    gltf["bufferViews"] = views
    gltf["accessors"] = accessors
    gltf["buffers"] = [{"byteLength": len(out_bin)}]
    gltf["meshes"] = [
        {"name": "shutters", "primitives": [{"attributes": new_attrs, "indices": len(accessors) - 1, "material": 0}]}
    ]
    gltf["nodes"] = [{"mesh": 0, "name": "shutters"}]
    gltf["scenes"] = [{"nodes": [0]}]
    gltf["scene"] = 0
    # The atlas image lives in a bufferView in some kits; this one is a URI, so
    # dropping the old views is safe. Assert rather than silently ship a texture-less piece.
    assert all("bufferView" not in img for img in gltf.get("images", [])), "atlas is embedded; keep its view"
    write_glb(TOWN / "shutters.glb", gltf, out_bin)
    return len(new_idx) // 3


def bbox(gltf_path):
    gltf, bin_ = load_glb(gltf_path)
    prim = gltf["meshes"][0]["primitives"][0]
    off, a = acc_off(gltf, prim["attributes"]["POSITION"])
    pos = read_vec(bin_, off, a["count"], 3)
    t = gltf["nodes"][0].get("translation", [0, 0, 0])
    return [
        (round(min(p[d] for p in pos) + t[d], 3), round(max(p[d] for p in pos) + t[d], 3))
        for d in range(3)
    ]


if __name__ == "__main__":
    mesh = make_door()
    tris = make_shutters()
    print("door.glb    ", bbox(TOWN / "door.glb"))
    print("shutters.glb", bbox(TOWN / "shutters.glb"), f"{tris} tris")
    # Both must land on the panel plane (x≈0.42-0.50) so they drop straight into
    # the manifest slots the wall panels vacated.
    for f in ("door.glb", "shutters.glb"):
        x = bbox(TOWN / f)[0]
        assert 0.40 <= x[0] and x[1] <= 0.51, f"{f} off the panel plane: {x}"
    print("ok: both sit on the +X panel plane")
