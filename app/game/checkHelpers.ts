// Shared fixtures for the *.check.ts self-checks (not a check itself — the
// npm test glob only picks up *.check.ts).
import { BUILDING_METADATA_BY_ID, rotatedFootprint, type BuildingId } from "./buildings.ts";
import type { GridPos, Tile, TileMap } from "./grid.ts";

/** Single test tile: an active origin cell unless overridden. */
export function tile(
  buildingId: BuildingId,
  x: number,
  y: number,
  overrides: Partial<Tile> = {}
): Tile {
  return {
    buildingId,
    type: BUILDING_METADATA_BY_ID[buildingId].type,
    position: { x, y },
    origin: { x, y },
    isOrigin: true,
    isActive: true,
    workers: 0,
    builtTick: 0,
    ...overrides,
  };
}

/** Stamp a building's full rotated footprint into a fresh TileMap. */
export function stamp(buildingId: BuildingId, origin: GridPos, rotation?: number): TileMap {
  const metadata = BUILDING_METADATA_BY_ID[buildingId];
  const { width, depth } = rotatedFootprint(metadata, rotation);
  const tiles: TileMap = {};
  for (let dx = 0; dx < width; dx += 1) {
    for (let dy = 0; dy < depth; dy += 1) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      tiles[`${x},${y}`] = tile(buildingId, x, y, {
        origin: { ...origin },
        isOrigin: dx === 0 && dy === 0,
        rotation,
      });
    }
  }
  return tiles;
}
