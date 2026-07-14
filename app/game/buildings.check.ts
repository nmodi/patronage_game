import assert from "node:assert";

import {
  BUILDING_TYPES,
  footprintMask,
  isDiagonalRotation,
  quarterOf,
  rotatedFootprint,
  yawOfRotation,
} from "./buildings.ts";

// Rotation encoding: 0-3 cardinal quarters, 4-7 = quarter (r-4) + 45°.
assert.equal(quarterOf(undefined), 0);
assert.equal(quarterOf(3), 3);
assert.equal(quarterOf(4), 0);
assert.equal(quarterOf(7), 3);
assert.equal(isDiagonalRotation(undefined), false);
assert.equal(isDiagonalRotation(3), false);
assert.equal(isDiagonalRotation(4), true);
assert.equal(yawOfRotation(0), 0);
assert.equal(yawOfRotation(4), Math.PI / 4);
assert.equal(yawOfRotation(5), Math.PI / 2 + Math.PI / 4);

for (const metadata of BUILDING_TYPES) {
  const { width, depth } = metadata.footprint;

  // rotatedFootprint reads the quarter component of diagonal rotations.
  assert.deepEqual(rotatedFootprint(metadata, 5), rotatedFootprint(metadata, 1));
  assert.deepEqual(rotatedFootprint(metadata, 4), rotatedFootprint(metadata, 0));

  // Cardinal masks are the axis-aligned rect: anchor at the min corner.
  for (const r of [undefined, 0, 1, 2, 3]) {
    const mask = footprintMask(metadata, r);
    const fp = rotatedFootprint(metadata, r);
    assert.equal(mask.cells.length, fp.width * fp.depth);
    assert.deepEqual(mask.cells[0], { x: 0, y: 0 });
    assert.ok(mask.cells.every((c) => c.x >= 0 && c.y >= 0));
    assert.deepEqual(mask.center, { x: (fp.width - 1) / 2, y: (fp.depth - 1) / 2 });
  }

  for (const r of [4, 5, 6, 7]) {
    const mask = footprintMask(metadata, r);

    // Non-empty; anchor (0,0) claimed and first (row-major); y offsets never
    // negative; no duplicate cells.
    assert.ok(mask.cells.length > 0, `${metadata.id} r=${r}: empty mask`);
    assert.deepEqual(mask.cells[0], { x: 0, y: 0 });
    assert.ok(mask.cells.every((c) => c.y >= 0));
    assert.equal(new Set(mask.cells.map((c) => `${c.x},${c.y}`)).size, mask.cells.length);

    // Every claimed cell center sits inside the rotated rect — re-derived
    // through the public center offset, catching anchor/center mismatches.
    if (mask.cells.length > 1) {
      const theta = yawOfRotation(r);
      for (const c of mask.cells) {
        const gx = c.x - mask.center.x;
        const gy = c.y - mask.center.y;
        const lx = gx * Math.cos(theta) - gy * Math.sin(theta);
        const lz = gx * Math.sin(theta) + gy * Math.cos(theta);
        assert.ok(
          Math.abs(lx) < width / 2 && Math.abs(lz) < depth / 2,
          `${metadata.id} r=${r}: cell (${c.x},${c.y}) outside the rotated rect`
        );
      }
    }
  }

  // 180° symmetry: the mask only depends on the rect's orientation mod π.
  assert.deepEqual(footprintMask(metadata, 4), footprintMask(metadata, 6));
  assert.deepEqual(footprintMask(metadata, 5), footprintMask(metadata, 7));
}

// Hand-derived: a 3×3 footprint at 45° is the 13-cell diamond |dx|+|dy| ≤ 2,
// anchored at its top cell (min y), center two cells below the anchor.
{
  const display = BUILDING_TYPES.find((b) => b.id === "sculpture_display")!;
  const mask = footprintMask(display, 4);
  assert.equal(mask.cells.length, 13);
  assert.deepEqual(mask.center, { x: 0, y: 2 });
  for (const c of mask.cells) {
    assert.ok(Math.abs(c.x - mask.center.x) + Math.abs(c.y - mask.center.y) <= 2);
  }
}

// Hand-derived: a 4×4 footprint at 45° claims 12 cells (edge slivers of the
// rotated rect fall short of neighboring cell centers).
{
  const cottage = BUILDING_TYPES.find((b) => b.id === "cottage")!;
  assert.equal(footprintMask(cottage, 4).cells.length, 12);
}

// Hand-derived: a 2×2 footprint at 45° is the 5-cell plus-shape.
{
  const tree = BUILDING_TYPES.find((b) => b.id === "tree")!;
  assert.equal(footprintMask(tree, 4).cells.length, 5);
}

// Degenerate: a 1×1 footprint at 45° claims exactly its own cell.
{
  const bush = BUILDING_TYPES.find((b) => b.id === "bush")!;
  const mask = footprintMask(bush, 4);
  assert.deepEqual(mask.cells, [{ x: 0, y: 0 }]);
  assert.deepEqual(mask.center, { x: 0, y: 0 });
}

console.log("buildings.check: all assertions passed");
