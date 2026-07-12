import { rotatedFootprint, type BuildingId } from "./buildings.ts";
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
  rotation?: number;
  workers: number;
  builtTick: number;
}

export type TileMap = Record<string, Tile>;

/** Center of a grid cell or building footprint in world coordinates. */
export function gridToWorld(
  gridX: number,
  gridY: number,
  metadata?: BuildingMetadata,
  rotation?: number
) {
  const footprint = metadata ? rotatedFootprint(metadata, rotation) : { width: 1, depth: 1 };
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const xOffset = ((footprint.width - 1) * CELL_SIZE) / 2;
  const zOffset = ((footprint.depth - 1) * CELL_SIZE) / 2;
  const x = gridX * CELL_SIZE - halfGrid + CELL_SIZE / 2 + xOffset;
  const z = gridY * CELL_SIZE - halfGrid + CELL_SIZE / 2 + zOffset;
  const height = metadata?.size.height ?? 0.2;
  const y = metadata?.type === "road" ? 0.001 : height / 2;
  return { x, y, z };
}

/** Grid cell containing a world-space point, or null outside the build area. */
export function worldToGrid(x: number, z: number): GridPos | null {
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const gridX = Math.floor((x + halfGrid) / CELL_SIZE);
  const gridY = Math.floor((z + halfGrid) / CELL_SIZE);
  if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) return null;
  return { x: gridX, y: gridY };
}
