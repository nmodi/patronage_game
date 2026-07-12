// Map water (design doc, G5): a seeded river — and on coastal runs, a sea —
// as a *derived layer*, not tiles. The store persists only `mapSeed`; the
// cells are recomputed from it here. Water blocks placement (the one gate in
// placeTiles) and everything else ignores it: empty cells already stop the
// connectivity BFS and citizen walks, so water blocks "by absence". Bridges
// (type "road") are the single building allowed onto water cells.
//
// Coordinates: grid cell (gx, gy) has its center at world
// x = gx * CELL_SIZE - HALF_GRID + CELL_SIZE / 2 (same for z from gy) — the
// same transform as grid.ts. Compass: east = +X, west = -X,
// north = +Z, south = -Z.

import { CELL_SIZE, GRID_SIZE } from "./constants.ts";
import { seededRng } from "./random.ts";

const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;

/** Water must stay this far (world units) from the grid edges parallel to the
 * river, so the larger bank always holds a real city. */
const EDGE_MARGIN = 5;
/** Narrowest rasterized river (world units). At 1.2 every cross-row of the
 * grid covers at least two cell centers — no one-cell trickle a road ghost
 * could visually straddle. */
const MIN_RIVER_WIDTH = 1.2;

/**
 * Map archetypes, rolled from the run seed:
 * - "dry"          — no water anywhere (the classic plain).
 * - "inland"       — a river meanders through the buildable grid.
 * - "coastal"      — a sea clips a waterfront strip off one grid edge; the
 *                    river flows through town into it at an estuary mouth.
 * - "scenic-river" — a river runs through the countryside beyond the grid;
 *                    pure scenery, no buildable cell is ever water.
 * - "scenic-coast" — sea and estuary sit entirely beyond the grid edge;
 *                    scenery only, like scenic-river.
 */
export type WaterArchetype = "dry" | "inland" | "coastal" | "scenic-river" | "scenic-coast";
export type CoastEdge = "north" | "south" | "east" | "west";

export interface WaterBody {
  archetype: WaterArchetype;
  /** Every "x,y" grid cell covered by water (river ∪ sea strip). Always empty
   * for dry and scenic archetypes. */
  cells: ReadonlySet<string>;
  /** Axis the river flows along ("x": west–east, "z": south–north). */
  riverAxis: "x" | "z";
  /** Cross-axis world coordinate of the river centerline at flow coordinate t. */
  riverCenterAt(t: number): number;
  /** River water width (world units) at flow coordinate t. */
  riverWidthAt(t: number): number;
  /** Signed world distance from the river's water edge; negative inside water.
   * +Infinity on dry maps (there is no river anywhere). */
  riverDistance(x: number, z: number): number;
  /** Present iff the map has a sea: the world edge it lies along. */
  coastEdge?: CoastEdge;
  /** Signed world distance past the coastline; positive = open sea.
   * -Infinity when the map has no sea. */
  seaDistance(x: number, z: number): number;
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export function generateWater(seed: string): WaterBody {
  // Namespaced hash: the run seed also feeds pickCityName — keep the streams
  // independent so adding water didn't reshuffle existing derived picks.
  const rand = seededRng(`water:${seed}`);

  // Archetype roll: most runs get water in play (it's the feature), but the
  // classic dry plain and scenery-only water keep the map pool varied.
  const roll = rand();
  const archetype: WaterArchetype =
    roll < 0.15
      ? "dry"
      : roll < 0.45
        ? "inland"
        : roll < 0.75
          ? "coastal"
          : roll < 0.9
            ? "scenic-river"
            : "scenic-coast";

  if (archetype === "dry") {
    return {
      archetype,
      cells: new Set<string>(),
      riverAxis: "x",
      riverCenterAt: () => 0,
      riverWidthAt: () => 0,
      riverDistance: () => Infinity,
      seaDistance: () => -Infinity,
    };
  }

  const hasSea = archetype === "coastal" || archetype === "scenic-coast";
  // Scenic water stays entirely outside the buildable grid.
  const scenic = archetype === "scenic-river" || archetype === "scenic-coast";
  const riverAxis: "x" | "z" = rand() < 0.5 ? "x" : "z";
  // Coast lies on the edge the river flows into: sign of the flow axis.
  const coastSign = rand() < 0.5 ? 1 : -1;

  // Meander: two gentle sine octaves over the full terrain span. Slopes are
  // capped (amp·2π/λ summed ≤ ~0.9) so consecutive 0.5-wu raster rows always
  // overlap by > one cell — a steeper meander can sever the river's own cells.
  const amp1 = 2 + rand() * 1.0;
  const freq1 = (Math.PI * 2) / (40 + rand() * 20);
  const phase1 = rand() * Math.PI * 2;
  const amp2 = 0.5 + rand() * 0.5;
  const freq2 = (Math.PI * 2) / (15 + rand() * 10);
  const phase2 = rand() * Math.PI * 2;

  // Width oscillates slowly along the flow; coastal mouths ramp to ~2×.
  const widthBase = 1.5 + rand() * 0.2;
  const widthVar = 0.3 + rand() * 0.15;
  const widthFreq = (Math.PI * 2) / (25 + rand() * 20);
  const widthPhase = rand() * Math.PI * 2;

  // Centerline offset from the grid middle. Through-town rivers are clamped
  // so water (center + full meander + half width) keeps EDGE_MARGIN from both
  // parallel grid edges; scenic rivers are pushed the same excursion PAST the
  // grid edge instead, so no meander can dip a cell into water.
  const maxExcursion = amp1 + amp2 + (widthBase + widthVar); // half of 2× mouth width
  const offsetSign = rand() < 0.5 ? -1 : 1;
  const offset = scenic
    ? offsetSign * (HALF_GRID + 1.5 + maxExcursion + rand() * 5)
    : offsetSign * Math.min(6 + rand() * 8, HALF_GRID - EDGE_MARGIN - maxExcursion);

  const coastAmp = 0.8 + rand() * 0.7;
  const coastFreq = (Math.PI * 2) / (20 + rand() * 20);
  const coastPhase = rand() * Math.PI * 2;
  // Coastline base, as an inset from the coast grid edge. Coastal maps clip a
  // waterfront strip 2–3.5 wu deep (±1.5 wiggle → the sea bites 1–10 cells);
  // a scenic coast sits far enough OUT that no wiggle reaches the grid.
  const coastInset =
    archetype === "scenic-coast" ? -(1.5 + coastAmp + rand() * 4) : 2 + rand() * 1.5;
  // Flow-axis coordinate where the river meets the sea (coastline base).
  const mouthT = coastSign * (HALF_GRID - coastInset);

  const riverCenterAt = (t: number) =>
    offset + amp1 * Math.sin(t * freq1 + phase1) + amp2 * Math.sin(t * freq2 + phase2);

  const riverWidthAt = (t: number) => {
    let width = widthBase + widthVar * Math.sin(t * widthFreq + widthPhase);
    if (hasSea) {
      // Estuary: widen toward the mouth over the last ~10 wu.
      width *= 1 + smoothstep((t * coastSign - (mouthT * coastSign - 10)) / 10);
    }
    return Math.max(MIN_RIVER_WIDTH, width);
  };

  const riverDistance = (x: number, z: number) => {
    const t = riverAxis === "x" ? x : z;
    const cross = riverAxis === "x" ? z : x;
    let d = Math.abs(cross - riverCenterAt(t)) - riverWidthAt(t) / 2;
    // Past the mouth the sea takes over — fade the river channel out instead
    // of carving a valley across the sea floor.
    if (hasSea) d = Math.max(d, t * coastSign - (mouthT * coastSign + 3));
    return d;
  };

  // Signed distance past the coastline along the flow axis; the coastline
  // itself wiggles along the cross axis.
  const seaDistance = hasSea
    ? (x: number, z: number) => {
        const t = riverAxis === "x" ? x : z;
        const cross = riverAxis === "x" ? z : x;
        const coastPos = HALF_GRID - coastInset + coastAmp * Math.sin(cross * coastFreq + coastPhase);
        return t * coastSign - coastPos;
      }
    : () => -Infinity;

  const cells = new Set<string>();
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const x = gx * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;
      const z = gy * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;
      if (riverDistance(x, z) < 0 || seaDistance(x, z) > 0) cells.add(`${gx},${gy}`);
    }
  }

  const coastEdge: CoastEdge | undefined = !hasSea
    ? undefined
    : riverAxis === "x"
      ? coastSign > 0
        ? "east"
        : "west"
      : coastSign > 0
        ? "north"
        : "south";

  return {
    archetype,
    cells,
    riverAxis,
    riverCenterAt,
    riverWidthAt,
    riverDistance,
    coastEdge,
    seaDistance,
  };
}

// Memoized on the seed string: the store calls getWaterCells inside placeTiles
// and the renderer reads the full body every frame-ish — one generation per run.
let cachedSeed: string | null = null;
let cachedBody: WaterBody | null = null;

/** The run's water body, or null when the run has no water (old saves, demo). */
export function getWater(mapSeed: string | null): WaterBody | null {
  if (mapSeed == null) return null;
  if (cachedSeed !== mapSeed || !cachedBody) {
    cachedBody = generateWater(mapSeed);
    cachedSeed = mapSeed;
  }
  return cachedBody;
}

const EMPTY_CELLS: ReadonlySet<string> = new Set();

/** Grid cells ("x,y") blocked by water for this run. Empty when mapSeed is null. */
export function getWaterCells(mapSeed: string | null): ReadonlySet<string> {
  return getWater(mapSeed)?.cells ?? EMPTY_CELLS;
}
