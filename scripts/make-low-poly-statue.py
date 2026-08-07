#!/usr/bin/env python3
"""Decimate a sculpture scan (STL/OBJ) into a low-poly flat-shaded GLB statue.

Sources: threedscans.com (Oliver Laric — published without restrictions).
Output: public/models/statues/<name>.glb, normalized to feet-at-origin,
height exactly 1.0, centered on x/z (in-game scale applied by displayArt.ts).

Needs: pip install trimesh fast-simplification scipy networkx "numpy<2"
Usage: python3 scripts/make-low-poly-statue.py <scan.stl> <name> [faces=600] [flip] [yup]
("flip" inverts the automatic right-side-up guess when it gets a piece wrong;
"yup" skips the z-up→y-up rotation for a scan that already stands up in y —
a figure that comes out lying on its side needs it)
Full recipe (source picking, venv, wiring): docs/reference/art-pipelines.md
"""
import sys
from pathlib import Path

import numpy as np
import trimesh

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "models" / "statues"


def main():
    src, name = sys.argv[1], sys.argv[2]
    opts = sys.argv[3:]
    faces = next((int(a) for a in opts if a.isdigit()), 600)  # the Aug 2026 baseline

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

    # Scanner frame is usually z-up; game is y-up. Rotate unless told the scan
    # already stands in y (threedscans is mixed — Theodoric/Hugh/Transi are
    # y-up). No auto-detect: guessing from the long axis broke on reclining
    # figures (length beats height, so the Pan stood on its end).
    if "yup" not in opts:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))

    # Some scans sit at an arbitrary angle in their own frame (Ephebe, Athena
    # hang tilted off their plinths) — no axis swap fixes that. "align" stands
    # the longest principal axis up instead; opt-in for the same reason the
    # z-up rotation is unconditional (it would tip a reclining figure on end).
    if "align" in opts:
        axis = np.linalg.svd(mesh.vertices - mesh.vertices.mean(axis=0))[2][0]
        mesh.apply_transform(trimesh.geometry.align_vectors(axis, [0, 1, 0]))

    # Right side up: the socle/turntable plane is the mesh's one big flat
    # region — its normal must point down. (A widest-slice guess was tried
    # first and coin-flipped on decimation noise for the reclining Pan.)
    areas, normals = mesh.area_faces, mesh.face_normals
    vert = (areas > np.percentile(areas, 85)) & (np.abs(normals[:, 1]) > 0.9)
    flip = (normals[vert][:, 1] * areas[vert]).sum() > 0
    if "flip" in opts:  # manual override, should the base plane guess miss
        flip = not flip
    if flip:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0]))
        print("flipped (base plane was up)")

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
