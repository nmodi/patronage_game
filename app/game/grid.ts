import { footprintMask, type BuildingId } from "./buildings.ts";
import { CELL_SIZE, GRID_SIZE } from "./constants.ts";
import type { BuildingMetadata, BuildingType } from "./types.ts";

export interface GridPos {
  x: number;
  y: number;
}

export interface Tile {
  type: BuildingType;
  buildingId: BuildingId;
  position: GridPos;
  origin: GridPos;
  isOrigin: boolean;
  isActive: boolean;
  variant?: number;
  // Buildings: 0-3 quarter turns, 4-7 = quarter (r-4) + 45° (diagonal mask
  // footprint — see buildings.ts footprintMask). Roads (all variants): undefined |
  // 1 (NE) | 3 (NW) ribbon orientation — see roadStretch.ts.
  rotation?: number;
  workers: number;
  builtTick: number;
  // True for road cells synthesized from a freeform RoadSegment (roadRaster.ts).
  // These live only in the derived `simTiles` the sim reads — never in the
  // persisted, canonical `tiles`, so they're never saved, razed, or drawn by
  // the cell renderer. Absent on all real tiles.
  derived?: boolean;
}

export type TileMap = Record<string, Tile>;

/** Center of a grid cell or building footprint in world coordinates. */
export function gridToWorld(
  gridX: number,
  gridY: number,
  metadata?: BuildingMetadata,
  rotation?: number
) {
  // footprintMask.center is ((w-1)/2, (d-1)/2) for cardinal rotations — the
  // pre-mask offsets exactly — and the rotated-rect center for diagonal ones.
  const center = metadata ? footprintMask(metadata, rotation).center : { x: 0, y: 0 };
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const x = gridX * CELL_SIZE - halfGrid + CELL_SIZE / 2 + center.x * CELL_SIZE;
  const z = gridY * CELL_SIZE - halfGrid + CELL_SIZE / 2 + center.y * CELL_SIZE;
  const height = metadata?.size.height ?? 0.2;
  const y = metadata?.type === "road" ? 0.001 : height / 2;
  return { x, y, z };
}

/** Fractional grid coordinates of a world-space point (no flooring/bounds) —
 * the road-snap cursor. */
export function worldToGridFloat(x: number, z: number) {
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  return { x: (x + halfGrid) / CELL_SIZE, y: (z + halfGrid) / CELL_SIZE };
}

/** Grid cell containing a world-space point, or null outside the build area. */
export function worldToGrid(x: number, z: number): GridPos | null {
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const gridX = Math.floor((x + halfGrid) / CELL_SIZE);
  const gridY = Math.floor((z + halfGrid) / CELL_SIZE);
  if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) return null;
  return { x: gridX, y: gridY };
}
