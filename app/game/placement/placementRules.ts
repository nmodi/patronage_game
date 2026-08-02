import {
  BUILDING_METADATA_BY_ID,
  buildOrderRank,
  escalatedCost,
  footprintMask,
  rotatedFootprint,
  type BuildingId,
} from "../buildings.ts";
import { GRID_SIZE } from "../constants.ts";
import { PLAZA_IDS } from "../city/connectivity.ts";
import type { GridPos, Tile, TileMap } from "../grid.ts";
import type { MaterialPools } from "../art/materials.ts";
import type { BuildingMetadata, Material } from "../types.ts";
import { getWaterCells } from "../map/water.ts";

export interface PlacementSnapshot {
  florins: number;
  materials: MaterialPools;
  // Blueprint-commission tokens; absent = none, so commissionOnly buildings
  // are unplaceable by default.
  fundedBuilds?: readonly string[];
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
  /** Construction materials the batch spends (buildCost × positions); {} for most buildings. */
  materialCost: Partial<Record<Material, number>>;
}

/**
 * Grand buildings spend construction materials at placement — lump-sum from
 * the city pools, exactly like a commission spends at assign (principle 2's
 * anti-simulation core: nothing is routed, nothing stalls mid-build). Returns
 * the batch's bill, or null when the stores can't cover it.
 */
function planMaterials(
  state: PlacementSnapshot,
  metadata: BuildingMetadata,
  count: number
): Partial<Record<Material, number>> | null {
  const bill: Partial<Record<Material, number>> = {};
  for (const [material, perBuilding] of Object.entries(metadata.buildCost ?? {})) {
    const amount = perBuilding * count;
    if ((state.materials[material as Material] ?? 0) < amount) return null;
    bill[material as Material] = amount;
  }
  return bill;
}

const CELL_NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** A plaza-footprint cell on the plaza's outer ring: some 4-neighbor offset
 * falls outside the plaza's footprint mask. Mask-based (not ownership-based)
 * so stalls can't erode a plaza inward ring by ring, and correct for diagonal
 * plazas. The origin cell stays off-limits — it carries the building. */
function isPlazaRimCell(tile: Tile, x: number, y: number): boolean {
  if (tile.type !== "city" || !PLAZA_IDS.has(tile.buildingId) || tile.isOrigin) return false;
  const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
  if (!metadata) return false;
  const { cells } = footprintMask(metadata, tile.rotation);
  const inMask = (dx: number, dy: number) =>
    cells.some((c) => c.x === dx && c.y === dy);
  const relX = x - tile.origin.x;
  const relY = y - tile.origin.y;
  return CELL_NEIGHBORS.some(([nx, ny]) => !inMask(relX + nx, relY + ny));
}

/** One footprint cell, shared by the batch planner and the preview check:
 * occupied cells block unless a decoration overlaps a non-origin cell or a
 * placesOnRoads building overwrites a plain road cell / plaza rim cell, and
 * free cells block on water for everything but bridges. */
function checkCell(
  tiles: TileMap,
  water: ReadonlySet<string>,
  x: number,
  y: number,
  isOriginCell: boolean,
  canOverlap: boolean,
  isBridge: boolean,
  onRoad: boolean
): "blocked" | "occupied" | "free" {
  const key = `${x},${y}`;
  const tile = tiles[key];
  if (tile) {
    if (onRoad) {
      // Overwrite a plain road cell (market stall). Excluded: bridge decks and
      // water (the water check below is skipped for occupied cells), diagonal
      // ribbon cells (rotation 1|3 — a stall would notch the 45° staircase).
      if (
        tile.type === "road" &&
        tile.buildingId !== "bridge" &&
        tile.rotation == null &&
        !water.has(key)
      ) {
        return "free";
      }
      // ... or a plaza's outer-ring cell (stalls ring a piazza; the interior —
      // and every plinth slot cell, all interior today — stays clear).
      if (isPlazaRimCell(tile, x, y)) return "free";
    }
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
  // Funded blueprint builds only: one token, one structure per placement.
  const funded = metadata.commissionOnly === true;
  if (funded && (positions.length !== 1 || !(state.fundedBuilds ?? []).includes(buildingId))) {
    return null;
  }

  const footprint = rotatedFootprint(metadata, rotation);
  const { cells } = footprintMask(metadata, rotation);
  const freeCells = new Set<string>();
  const water = getWaterCells(state.mapSeed);
  const canOverlap = metadata.type === "decoration";
  const isBridge = buildingId === "bridge";
  const onRoad = metadata.placesOnRoads === true;

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
        x,
        y,
        offset.x === 0 && offset.y === 0,
        canOverlap,
        isBridge,
        onRoad
      );
      if (cell === "blocked") return null;
      if (cell === "free") {
        if (freeCells.has(key)) return null; // batch positions may not overlap
        freeCells.add(key);
      }
    }
  }

  // "The requester funds construction": a funded build costs no florins —
  // its buildCost materials (below) are the only bill.
  const startRank = buildOrderRank(state.map.tiles, buildingId);
  let totalCost = 0;
  if (!funded) {
    for (let i = 0; i < positions.length; i += 1) totalCost += escalatedCost(metadata, startRank + i);
  }
  if (state.florins < totalCost) return null;
  const materialCost = planMaterials(state, metadata, positions.length);
  if (!materialCost) return null;
  return { metadata, footprint, cells, positions, freeCells, totalCost, materialCost };
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
  if (!metadata) return false;
  if (metadata.commissionOnly) {
    if (!(state.fundedBuilds ?? []).includes(buildingId)) return false;
  } else if (state.florins < escalatedCost(metadata, buildOrderRank(state.map.tiles, buildingId))) {
    return false;
  }
  if (!planMaterials(state, metadata, 1)) return false;

  const { cells } = footprintMask(metadata, rotation);
  const water = getWaterCells(state.mapSeed);
  const canOverlap = metadata.type === "decoration";
  const isBridge = buildingId === "bridge";
  const onRoad = metadata.placesOnRoads === true;
  for (const offset of cells) {
    const x = position.x + offset.x;
    const y = position.y + offset.y;
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return false;
    const cell = checkCell(
      state.map.tiles,
      water,
      x,
      y,
      offset.x === 0 && offset.y === 0,
      canOverlap,
      isBridge,
      onRoad
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
    materialCost: {}, // roads/linear never carry buildCost
  };
}
