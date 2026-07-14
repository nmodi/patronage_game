// Shared fixtures for the *.check.ts self-checks (not a check itself — the
// npm test glob only picks up *.check.ts).
import { BUILDING_METADATA_BY_ID, footprintMask, type BuildingId } from "./buildings.ts";
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

/** Stamp a building's full footprint (rect or diagonal mask) into a fresh TileMap. */
export function stamp(buildingId: BuildingId, origin: GridPos, rotation?: number): TileMap {
  const metadata = BUILDING_METADATA_BY_ID[buildingId];
  const tiles: TileMap = {};
  for (const offset of footprintMask(metadata, rotation).cells) {
    const x = origin.x + offset.x;
    const y = origin.y + offset.y;
    tiles[`${x},${y}`] = tile(buildingId, x, y, {
      origin: { ...origin },
      isOrigin: offset.x === 0 && offset.y === 0,
      rotation,
    });
  }
  return tiles;
}
