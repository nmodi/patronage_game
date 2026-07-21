// Self-check for freeform road segment geometry.
// Run: node --experimental-strip-types app/game/roadSegment.check.ts
import assert from "node:assert";

import {
  nodesOf,
  pointToSegmentDistance,
  segmentDir,
  segmentLength,
  segmentNormal,
  type RoadSegment,
} from "./roadSegment.ts";

const seg = (ax: number, az: number, bx: number, bz: number): RoadSegment => ({
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  width: 0.5,
  buildingId: "path",
});

// Length.
assert.equal(segmentLength(seg(0, 0, 3, 4)), 5);
assert.equal(segmentLength(seg(2, 2, 2, 2)), 0);

// Direction is a unit vector; degenerate falls back to +x.
{
  const d = segmentDir(seg(0, 0, 0, 4));
  assert.ok(Math.abs(d.x) < 1e-9 && Math.abs(d.z - 1) < 1e-9);
  const dd = segmentDir(seg(1, 1, 1, 1));
  assert.deepEqual(dd, { x: 1, z: 0 });
}

// Normal is perpendicular and unit.
{
  const n = segmentNormal(seg(0, 0, 4, 0)); // dir +x → normal ±z
  assert.ok(Math.abs(Math.hypot(n.x, n.z) - 1) < 1e-9);
  assert.ok(Math.abs(n.x) < 1e-9);
}

// Point-to-segment distance: perpendicular, and endpoint-clamped.
{
  const s = seg(0, 0, 10, 0);
  assert.equal(pointToSegmentDistance(5, 3, s), 3); // perpendicular
  assert.equal(pointToSegmentDistance(-4, 0, s), 4); // clamped to endpoint a
  assert.equal(pointToSegmentDistance(13, 4, s), 5); // clamped to endpoint b (3,4)→5
}

// Node dedup: a shared endpoint collapses to one node.
{
  const nodes = nodesOf([seg(0, 0, 1, 1), seg(1, 1, 2, 0)]);
  assert.equal(nodes.length, 3); // (0,0),(1,1),(2,0) — the shared (1,1) counted once
}

console.log("roadSegment.check: all assertions passed");
