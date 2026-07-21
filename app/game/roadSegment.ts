// Freeform road geometry (design doc, Roads → non-grid placement). A road the
// player lays at any angle is a straight segment between two world-space nodes,
// carried in the store's `roads` array. The sim never reads this: roadRaster.ts
// rasterizes each segment into road cells so connectivity/traffic/citizen walks
// see ordinary `type:"road"` tiles (rotation undefined) and need no changes.
// Curves are chains of straight segments — no beziers in v1.
//
// No Babylon or store imports: roadSegment.check.ts runs this under plain Node.
// Coordinates are world XZ (east = +x, north = +z — same frame as water.ts).

import type { BuildingId } from "./buildings.ts";

export interface WorldPoint {
  x: number;
  z: number;
}

export interface RoadSegment {
  a: WorldPoint;
  b: WorldPoint;
  /** Full ribbon width in world units (roadWidth × CELL_SIZE). */
  width: number;
  buildingId: BuildingId;
}

export function segmentLength(seg: RoadSegment): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.z - seg.a.z);
}

/** Unit direction a→b, or {x:1,z:0} for a degenerate (zero-length) segment. */
export function segmentDir(seg: RoadSegment): WorldPoint {
  const len = segmentLength(seg);
  if (len < 1e-9) return { x: 1, z: 0 };
  return { x: (seg.b.x - seg.a.x) / len, z: (seg.b.z - seg.a.z) / len };
}

/** Unit normal (left of the a→b direction). */
export function segmentNormal(seg: RoadSegment): WorldPoint {
  const d = segmentDir(seg);
  return { x: -d.z, z: d.x };
}

/** Shortest distance from a world point to the segment (clamped to endpoints). */
export function pointToSegmentDistance(px: number, pz: number, seg: RoadSegment): number {
  const dx = seg.b.x - seg.a.x;
  const dz = seg.b.z - seg.a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-18) return Math.hypot(px - seg.a.x, pz - seg.a.z);
  let t = ((px - seg.a.x) * dx + (pz - seg.a.z) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (seg.a.x + t * dx), pz - (seg.a.z + t * dz));
}

/** Distinct endpoint nodes across all segments (for joint caps / node snap),
 * deduped by rounded world position so shared endpoints collapse to one. */
export function nodesOf(roads: RoadSegment[], epsilon = 1e-3): WorldPoint[] {
  const seen = new Map<string, WorldPoint>();
  const q = (v: number) => Math.round(v / epsilon);
  for (const seg of roads) {
    for (const p of [seg.a, seg.b]) {
      const key = `${q(p.x)},${q(p.z)}`;
      if (!seen.has(key)) seen.set(key, p);
    }
  }
  return [...seen.values()];
}
