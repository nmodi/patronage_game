// Freeform-road rasterization (design doc, Roads → non-grid placement). The
// player lays roads as float RoadSegments (roadSegment.ts); the sim only knows
// road *cells*. This maps each segment to the grid cells it covers and unions
// them under the canonical tiles as `simTiles`, so connectivity.ts, traffic.ts,
// and the citizen walk read ordinary `type:"road"` tiles and need no changes.
//
// The one load-bearing invariant: a segment's cell set MUST be 8-connected, or
// a freeform road silently stops conducting the plaza network / fragments
// citizen walks. Guaranteed by sampling the centerline finer than a cell (the
// spine cells of consecutive samples are always ≤1 apart on each axis, so
// king-adjacent) and dilating by half-width; asserted in roadRaster.check.ts.
//
// No Babylon or store imports: roadRaster.check.ts runs this under plain Node.

import { CELL_SIZE, GRID_SIZE } from "./constants.ts";
import type { GridPos, Tile, TileMap } from "./grid.ts";
import { segmentLength, type RoadSegment } from "./roadSegment.ts";

const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;

/** Cell containing a world point (floor, same transform as grid.ts worldToGrid). */
function cellOf(x: number, z: number): { gx: number; gy: number } {
  return {
    gx: Math.floor((x + HALF_GRID) / CELL_SIZE),
    gy: Math.floor((z + HALF_GRID) / CELL_SIZE),
  };
}

/** World center of cell (gx, gy). */
function cellCenter(gx: number, gy: number): { x: number; z: number } {
  return {
    x: gx * CELL_SIZE - HALF_GRID + CELL_SIZE / 2,
    z: gy * CELL_SIZE - HALF_GRID + CELL_SIZE / 2,
  };
}

const rasterMemo = new WeakMap<RoadSegment, GridPos[]>();

/**
 * The grid cells a width-`w` segment covers. Supercover of the centerline
 * (guarantees an 8-connected spine) dilated by the half-width. Cells outside
 * the grid are dropped. Memoized per segment identity.
 */
export function rasterizeSegment(seg: RoadSegment): GridPos[] {
  const cached = rasterMemo.get(seg);
  if (cached) return cached;

  const cells = new Set<string>();
  const halfW = seg.width / 2;
  const len = segmentLength(seg);
  // Sample every quarter-cell so consecutive spine cells stay king-adjacent.
  const steps = Math.max(1, Math.ceil(len / (CELL_SIZE * 0.25)));
  // Dilation reach in cells: half-width plus the cell's own half-extent.
  const reach = Math.ceil(halfW / CELL_SIZE + 0.5);

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const px = seg.a.x + (seg.b.x - seg.a.x) * t;
    const pz = seg.a.z + (seg.b.z - seg.a.z) * t;
    const { gx, gy } = cellOf(px, pz);
    // Spine: the cell the centerline passes through (connectivity guarantee).
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
      cells.add(`${gx},${gy}`);
    }
    // Width: every cell whose center is within half-width of this sample.
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const cx = gx + dx;
        const cy = gy + dy;
        if (cx < 0 || cx >= GRID_SIZE || cy < 0 || cy >= GRID_SIZE) continue;
        const c = cellCenter(cx, cy);
        if (Math.hypot(px - c.x, pz - c.z) <= halfW) cells.add(`${cx},${cy}`);
      }
    }
  }

  const result: GridPos[] = [];
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number);
    result.push({ x: x!, y: y! });
  }
  rasterMemo.set(seg, result);
  return result;
}

/** A derived road tile for cell (gx, gy) from a segment. */
function derivedRoadTile(gx: number, gy: number, buildingId: string): Tile {
  return {
    type: "road",
    buildingId: buildingId as Tile["buildingId"],
    position: { x: gx, y: gy },
    origin: { x: gx, y: gy },
    isOrigin: true,
    isActive: true,
    // Undefined = cardinal: connectivity ignores rotation, and checkCell's
    // placesOnRoads path wants rotation == null. The renderer never sees these.
    rotation: undefined,
    workers: 0,
    builtTick: 0,
    derived: true,
  };
}

/** All road cells implied by the freeform segments, tagged `derived`. */
export function deriveRoadCells(roads: RoadSegment[]): TileMap {
  const out: TileMap = {};
  for (const seg of roads) {
    for (const { x, y } of rasterizeSegment(seg)) {
      const key = `${x},${y}`;
      if (!out[key]) out[key] = derivedRoadTile(x, y, seg.buildingId);
    }
  }
  return out;
}

// Memoized on (tiles, roads) identity: the store replaces both objects on any
// change, so a cache hit is always current and keeps connectivity.ts's own
// WeakMap warm across a tick's several calls.
const simMemo = new WeakMap<TileMap, WeakMap<RoadSegment[], TileMap>>();

/**
 * The tile view the sim reads: rasterized road cells with the canonical tiles
 * layered on top (a real placed building/legacy road always wins its cell).
 * When there are no freeform roads, returns `tiles` unchanged — identity
 * preserved, so downstream memoization on plain saves is untouched.
 */
export function deriveSimTiles(tiles: TileMap, roads: RoadSegment[]): TileMap {
  if (roads.length === 0) return tiles;
  let byRoads = simMemo.get(tiles);
  if (!byRoads) {
    byRoads = new WeakMap();
    simMemo.set(tiles, byRoads);
  }
  const cached = byRoads.get(roads);
  if (cached) return cached;
  const merged: TileMap = { ...deriveRoadCells(roads), ...tiles };
  byRoads.set(roads, merged);
  return merged;
}
