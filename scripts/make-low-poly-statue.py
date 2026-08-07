#!/usr/bin/env python3
"""Decimate a sculpture scan (STL/OBJ) into a low-poly flat-shaded GLB statue.

Sources: threedscans.com (Oliver Laric — published without restrictions).
Output: public/models/statues/<name>.glb, normalized to feet-at-origin,
height exactly 1.0, centered on x/z (in-game scale applied by displayArt.ts).

Needs: pip install trimesh fast-simplification "numpy<2"
Usage: python3 scripts/make-low-poly-statue.py <scan.stl> <name> [faces=1200]
"""
import sys
from pathlib import Path

import numpy as np
import trimesh

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "models" / "statues"


def main():
    src, name = sys.argv[1], sys.argv[2]
    faces = int(sys.argv[3]) if len(sys.argv) > 3 else 1200

    mesh = trimesh.load(src, force="mesh")
    print(f"loaded: {len(mesh.faces)} faces")

    # One pass can stall far above target on messy scan topology — iterate
    # until within 10% of target or the count stops moving.
    def decimate_to(m, target):
        while len(m.faces) > target * 1.1:
            before = len(m.faces)
            m = m.simplify_quadric_decimation(face_count=target)
            if len(m.faces) >= before * 0.98:
                break
        return m

    # Two-stage: rough cut, drop floaters (turntable fragments), then finish.
    # Splitting after the final cut can gut a very low-poly mesh; splitting
    # before any cut makes connected-components crawl on the full scan.
    mesh = decimate_to(mesh, max(faces * 4, 2000))
    bodies = mesh.split(only_watertight=False)
    if len(bodies) > 1:
        mesh = max(bodies, key=lambda b: len(b.faces))
        print(f"largest of {len(bodies)} bodies: {len(mesh.faces)} faces")
    mesh = decimate_to(mesh, faces)
    print(f"decimated: {len(mesh.faces)} faces")

    # Scanner frame is z-up; game is y-up. Statues are taller than wide, so
    # rotate only when z is the long axis (already-y-up inputs pass through).
    ext = mesh.extents
    if ext[2] > ext[1]:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))

    # Right side up: the base/socle is the widest slice, so if the top 10% of
    # the height has a bigger footprint than the bottom 10%, flip it.
    def slab_width(lo_f, hi_f):
        y = mesh.vertices[:, 1]
        y0, y1 = y.min(), y.max()
        sel = mesh.vertices[(y >= y0 + (y1 - y0) * lo_f) & (y <= y0 + (y1 - y0) * hi_f)]
        return (sel[:, 0].ptp() + sel[:, 2].ptp()) if len(sel) else 0.0

    if slab_width(0.9, 1.0) > slab_width(0.0, 0.1):
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0]))
        print("flipped (base was at top)")

    # Normalize: feet at y=0, height 1.0, centered on x/z.
    lo, hi = mesh.bounds
    mesh.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    mesh.apply_scale(1.0 / (hi[1] - lo[1]))

    mesh.unmerge_vertices()  # per-face normals — baked flat shading

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{name}.glb"
    mesh.export(out)
    print(f"{out}: {out.stat().st_size} bytes, height {mesh.extents[1]:.3f}")


if __name__ == "__main__":
    main()
