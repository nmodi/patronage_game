// Self-check for the per-tile bustle field (kernel sampling + bookkeeping).
// Run: node --experimental-strip-types app/game/city/bustleField.check.ts
import assert from "node:assert";

import { gridToWorld } from "../grid.ts";
import { BUSTLE_LOCAL_FULL, BUSTLE_RADIUS, createBustleField } from "./bustleField.ts";

const at = (cx: number, cy: number) => gridToWorld(cx, cy);
const CELL = 0.5; // CELL_SIZE — world units per cell

// Bookkeeping: spawn → walk → despawn leaves the field empty; a move into an
// occupied cell merges; re-clearing an empty field is a no-op.
{
  const f = createBustleField();
  assert.equal(f.sampleAt(0, 0), 0, "empty field samples 0");
  f.move(null, "10,10"); // spawn
  f.move("10,10", "10,11"); // walk
  f.move(null, "10,11"); // second figure joins the cell
  assert.equal(f.size(), 1, "co-located figures share one cell entry");
  f.move("10,11", null); // despawn
  f.move("10,11", null);
  assert.equal(f.size(), 0, "spawn/walk/despawn balances to empty");
  const p = at(10, 11);
  assert.equal(f.sampleAt(p.x, p.z), 0, "emptied field samples 0");
  f.clear();
}

// One figure at the sample point contributes exactly 1/BUSTLE_LOCAL_FULL.
{
  const f = createBustleField();
  f.move(null, "100,100");
  const p = at(100, 100);
  assert.ok(Math.abs(f.sampleAt(p.x, p.z) - 1 / BUSTLE_LOCAL_FULL) < 1e-9);
}

// Kernel: monotonic non-increasing with distance, 0 at/beyond BUSTLE_RADIUS.
{
  const f = createBustleField();
  f.move(null, "100,100");
  const p = at(100, 100);
  let prev = Infinity;
  for (let cells = 0; cells * CELL <= BUSTLE_RADIUS + 2; cells++) {
    const g = f.sampleAt(p.x + cells * CELL, p.z);
    assert.ok(g <= prev, `monotonic in distance, broke at ${cells} cells`);
    if (cells * CELL >= BUSTLE_RADIUS) assert.equal(g, 0, `zero at ${cells} cells`);
    prev = g;
  }
}

// Additive until the clamp: k center figures = k × one; never exceeds 1.
{
  const f = createBustleField();
  const p = at(100, 100);
  for (let k = 1; k <= BUSTLE_LOCAL_FULL; k++) {
    f.move(null, "100,100");
    assert.ok(Math.abs(f.sampleAt(p.x, p.z) - k / BUSTLE_LOCAL_FULL) < 1e-9, `k=${k} additive`);
  }
  for (let k = 0; k < 100; k++) f.move(null, "100,100");
  assert.equal(f.sampleAt(p.x, p.z), 1, "clamps at 1");
}

// Custom radius respected: a figure outside the default reach but inside a
// wider one contributes only to the wider sample.
{
  const f = createBustleField();
  f.move(null, "100,100");
  const p = at(100, 100);
  const d = BUSTLE_RADIUS + 1;
  assert.equal(f.sampleAt(p.x + d, p.z), 0, "outside default radius");
  assert.ok(f.sampleAt(p.x + d, p.z, BUSTLE_RADIUS * 2) > 0, "inside custom radius");
}

console.log("bustleField.check: all assertions passed");
