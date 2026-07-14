import {
  BUILDING_METADATA_BY_ID,
  footprintMask,
  rotatedFootprint,
  type BuildingId,
} from "./buildings.ts";
import { GRID_SIZE } from "./constants.ts";
import type { GridPos, TileMap } from "./grid.ts";
import type { BuildingMetadata } from "./types.ts";
import { getWaterCells } from "./water.ts";

export interface PlacementSnapshot {
  florins: number;
  mapSeed: string | null;
  map: { tiles: TileMap };
}

export interface PlacementPlan {
  metadata: BuildingMetadata;
  footprint: { width: number; depth: number };
  /** Claimed cell offsets from each origin (footprintMask; (0,0) first). */
  cells: ReadonlyArray<{ x: number; y: number }>;
  positions: GridPos[];
  freeCells: ReadonlySet<string>;
  totalCost: number;
}

/** One footprint cell, shared by the batch planner and the preview check:
 * occupied cells block unless a decoration overlaps a non-origin cell, and
 * free cells block on water for everything but bridges. */
function checkCell(
  tiles: TileMap,
  water: ReadonlySet<string>,
  key: string,
  isOriginCell: boolean,
  canOverlap: boolean,
  isBridge: boolean
): "blocked" | "occupied" | "free" {
  if (tiles[key]) {
    return !canOverlap || isOriginCell ? "blocked" : "occupied";
  }
  return !isBridge && water.has(key) ? "blocked" : "free";
}

/** Authoritative validation for a batch of building origins. */
export function planPlacement(
  state: PlacementSnapshot,
  positions: GridPos[],
  buildingId: BuildingId,
  rotation?: number
): PlacementPlan | null {
  const metadata = BUILDING_METADATA_BY_ID[buildingId];
  if (!metadata || positions.length === 0) return null;

  const footprint = rotatedFootprint(metadata, rotation);
  const { cells } = footprintMask(metadata, rotation);
  const freeCells = new Set<string>();
  const water = getWaterCells(state.mapSeed);
  const canOverlap = metadata.type === "decoration";
  const isBridge = buildingId === "bridge";

  for (const position of positions) {
    for (const offset of cells) {
      const x = position.x + offset.x;
      const y = position.y + offset.y;
      // Per-cell bounds: diagonal masks have negative x offsets, so an
      // origin-corner test can't stand in for the whole footprint.
      if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return null;
      const key = `${x},${y}`;
      const cell = checkCell(
        state.map.tiles,
        water,
        key,
        offset.x === 0 && offset.y === 0,
        canOverlap,
        isBridge
      );
      if (cell === "blocked") return null;
      if (cell === "free") {
        if (freeCells.has(key)) return null; // batch positions may not overlap
        freeCells.add(key);
      }
    }
  }

  const totalCost = metadata.baseCost * positions.length;
  if (state.florins < totalCost) return null;
  return { metadata, footprint, cells, positions, freeCells, totalCost };
}

/** planPlacement for a single origin as a boolean, allocation-free — safe to
 * call every frame from the placement ghost. */
export function canPlaceAt(
  state: PlacementSnapshot,
  position: GridPos,
  buildingId: BuildingId,
  rotation?: number
): boolean {
  const metadata = BUILDING_METADATA_BY_ID[buildingId];
  if (!metadata || state.florins < metadata.baseCost) return false;

  const { cells } = footprintMask(metadata, rotation);
  const water = getWaterCells(state.mapSeed);
  const canOverlap = metadata.type === "decoration";
  const isBridge = buildingId === "bridge";
  for (const offset of cells) {
    const x = position.x + offset.x;
    const y = position.y + offset.y;
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return false;
    const key = `${x},${y}`;
    const cell = checkCell(
      state.map.tiles,
      water,
      key,
      offset.x === 0 && offset.y === 0,
      canOverlap,
      isBridge
    );
    if (cell === "blocked") return false;
  }
  return true;
}

/**
 * Plan a drag-placed road or linear decoration in one pass (these are all
 * 1×1-footprint cells). Existing compatible cells join the run for free; only
 * newly claimed cells are validated (water blocks all but bridges) and charged.
 */
export function planLinearPlacement(
  state: PlacementSnapshot,
  positions: GridPos[],
  buildingId: BuildingId
): PlacementPlan | null {
  const metadata = BUILDING_METADATA_BY_ID[buildingId];
  if (!metadata || (metadata.type !== "road" && !metadata.linear) || positions.length === 0) {
    return null;
  }

  const water = getWaterCells(state.mapSeed);
  const isBridge = buildingId === "bridge";
  const newCells: GridPos[] = [];
  const freeCells = new Set<string>();
  for (const position of positions) {
    if (position.x < 0 || position.x >= GRID_SIZE || position.y < 0 || position.y >= GRID_SIZE) {
      return null;
    }
    const key = `${position.x},${position.y}`;
    const tile = state.map.tiles[key];
    if (!tile) {
      if (freeCells.has(key)) return null; // drag positions may not overlap
      if (!isBridge && water.has(key)) return null;
      freeCells.add(key);
      newCells.push(position);
      continue;
    }
    const joinable =
      metadata.type === "road" ? tile.type === "road" : tile.buildingId === buildingId;
    if (!joinable) return null;
  }

  const totalCost = metadata.baseCost * newCells.length;
  if (state.florins < totalCost) return null;
  return {
    metadata,
    footprint: metadata.footprint,
    cells: [{ x: 0, y: 0 }], // roads/linear are all 1×1 segments
    positions: newCells,
    freeCells,
    totalCost,
  };
}
