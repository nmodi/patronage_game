// Self-check for road drag rasterization (octant snap, diagonal staircases).
// Run: node --experimental-strip-types app/game/roadStretch.check.ts
import assert from "node:assert";

import { GRID_SIZE } from "./constants.ts";
import { buildRoadStretch, ROAD_DIAG_NE, ROAD_DIAG_NW } from "./roadStretch.ts";

const keys = (r: { positions: Array<{ x: number; y: number }> }) =>
  r.positions.map((p) => `${p.x},${p.y}`);

// Zero-drag: width×width block, no rotation.
{
  const r = buildRoadStretch({ x: 5, y: 5 }, { x: 5, y: 5 }, 2, true);
  assert.deepEqual(keys(r).sort(), ["5,5", "5,6", "6,5", "6,6"]);
  assert.equal(r.rotation, undefined);
}

// Cardinal drags are identical to the old dominant-axis behavior.
{
  const r = buildRoadStretch({ x: 2, y: 3 }, { x: 6, y: 3 }, 2, true); // east, width 2
  assert.deepEqual(keys(r), ["2,3", "2,4", "3,3", "3,4", "4,3", "4,4", "5,3", "5,4", "6,3", "6,4"]);
  assert.equal(r.rotation, undefined);
  const w = buildRoadStretch({ x: 4, y: 6 }, { x: 4, y: 2 }, 1, true); // north (−y), width 1
  assert.deepEqual(keys(w), ["4,6", "4,5", "4,4", "4,3", "4,2"]);
}

// A shallow drag (< 22.5°) stays cardinal.
{
  const r = buildRoadStretch({ x: 0, y: 0 }, { x: 10, y: 2 }, 1, true);
  assert.equal(r.rotation, undefined);
  assert.equal(r.positions.length, 11); // x-run 0..10
}

// Exact NE diagonal.
{
  const r = buildRoadStretch({ x: 0, y: 0 }, { x: 5, y: 5 }, 1, true);
  assert.deepEqual(keys(r), ["0,0", "1,1", "2,2", "3,3", "4,4", "5,5"]);
  assert.equal(r.rotation, ROAD_DIAG_NE);
}

// Off-ray hover projects onto the snapped diagonal: (7,5) → 6 steps, end (6,6).
{
  const r = buildRoadStretch({ x: 0, y: 0 }, { x: 7, y: 5 }, 1, true);
  assert.equal(r.rotation, ROAD_DIAG_NE);
  assert.equal(keys(r)[keys(r).length - 1], "6,6");
}

// NW diagonal (+x, −y), and its mirror (−x, +y) shares the ribbon orientation.
{
  const r = buildRoadStretch({ x: 0, y: 5 }, { x: 5, y: 0 }, 1, true);
  assert.deepEqual(keys(r), ["0,5", "1,4", "2,3", "3,2", "4,1", "5,0"]);
  assert.equal(r.rotation, ROAD_DIAG_NW);
  const m = buildRoadStretch({ x: 5, y: 0 }, { x: 0, y: 5 }, 1, true);
  assert.equal(m.rotation, ROAD_DIAG_NW);
}

// Width-2 diagonal: rows offset +1 along x, 2·(n+1) unique cells.
{
  const r = buildRoadStretch({ x: 0, y: 0 }, { x: 3, y: 3 }, 2, true);
  assert.equal(r.positions.length, 8);
  assert.equal(new Set(keys(r)).size, 8);
  assert.ok(keys(r).includes("1,1") && keys(r).includes("2,1"));
}

// allowDiagonal=false falls back to cardinal (bridge / dirt_path / fences).
{
  const r = buildRoadStretch({ x: 0, y: 0 }, { x: 5, y: 5 }, 1, false);
  assert.equal(r.rotation, undefined);
  assert.deepEqual(keys(r), ["0,0", "1,0", "2,0", "3,0", "4,0", "5,0"]);
}

// Map-edge clamp: the spine never leaves the grid.
{
  const a = { x: GRID_SIZE - 2, y: GRID_SIZE - 2 };
  const r = buildRoadStretch(a, { x: GRID_SIZE + 3, y: GRID_SIZE + 3 }, 1, true);
  assert.equal(keys(r)[keys(r).length - 1], `${GRID_SIZE - 1},${GRID_SIZE - 1}`);
}

console.log("roadStretch.check: all assertions passed");
