// Validation + cost for placing a freeform road segment. Rasterizes the
// segment (roadRaster.ts) and reuses the existing per-cell linear-road planner
// (placementRules.ts) so water-blocking, join-existing-road-free, and the
// baseCost × new-cells pricing stay identical to grid-drawn roads. The segment
// is validated against the *derived* sim tiles so it joins (and pays nothing
// for) cells an earlier freeform road already covers.

import type { GridPos } from "./grid.ts";
import { planLinearPlacement, type PlacementSnapshot } from "./placementRules.ts";
import { deriveSimTiles } from "./roadRaster.ts";
import { rasterizeSegment } from "./roadRaster.ts";
import type { RoadSegment } from "./roadSegment.ts";

export interface SegmentPlan {
  /** Cells this segment newly claims (drives cost and the derived overlay). */
  newCells: GridPos[];
  /** Every cell the segment covers (existing + new) — for the ghost. */
  cells: GridPos[];
  totalCost: number;
}

export interface SegmentSnapshot extends PlacementSnapshot {
  map: PlacementSnapshot["map"] & { roads: RoadSegment[] };
}

/** Plan a freeform segment, or null if it can't be placed (off-grid, on water
 * for non-bridges, overlapping a building, or unaffordable). */
export function planSegmentPlacement(
  state: SegmentSnapshot,
  seg: RoadSegment
): SegmentPlan | null {
  const cells = rasterizeSegment(seg);
  if (cells.length === 0) return null;
  // Validate against the sim view so existing freeform road cells join free
  // and buildings still block, exactly like grid roads against `tiles`.
  const simTiles = deriveSimTiles(state.map.tiles, state.map.roads);
  const plan = planLinearPlacement(
    { florins: state.florins, mapSeed: state.mapSeed, map: { tiles: simTiles } },
    cells,
    seg.buildingId
  );
  if (!plan) return null;
  return { newCells: plan.positions, cells, totalCost: plan.totalCost };
}
