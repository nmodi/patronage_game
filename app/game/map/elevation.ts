// Terrain elevation (terraces): a seeded per-cell integer height level, as a
// *derived layer* like water — the store persists only `elevationSeed`; the
// levels are recomputed from it here. Quantized terraces (never slopes) keep
// every cell locally flat, so buildings need one rule (footprint spans a
// single level, placementRules.ts), roads ramp any 1-level step, and the
// render y-ladder survives as offsets from each cell's ground height.
//
// Invariants the rest of the game leans on:
// - 4-neighbor cells never differ by more than 1 level (roads/walkers ramp
//   exactly one step; enforced by a lowering pass after generation).
// - Land near water is level 0, with level 1/2 set back further (SETBACK), so
//   banks, bridges, and the water render pipeline never meet a cliff.
// - `elevationSeed: null` (pre-elevation saves, demo) = the flat classic map.

import { CELL_SIZE, GRID_SIZE } from "../constants.ts";
import { seededRng } from "../random.ts";
import { getWater } from "./water.ts";

const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;

export const MAX_LEVEL = 2;
/** World height of one terrace step. Cliffs read at 0.3; a one-step road ramp
 * across a 0.5-wu cell is ~31°, in line with the bridge-deck stair slope. */
export const LEVEL_HEIGHT = 0.3;
/** Land within this world distance of a water edge stays level 0. */
const WATER_MARGIN = 2.5;
/** Each further level needs this much more distance from water — terraces
 * bank away from the river instead of meeting it with a wall. */
const SETBACK = 1.5;

export interface Elevation {
  hilly: boolean;
  /** Highest level present (0 on flat maps) — the picking loop's plane count. */
  maxLevel: number;
  /** Terrace level of a grid cell; coordinates clamp to the grid edge so
   * out-of-grid samples continue the rim cell (terrain skirt rendering). */
  levelAt(gx: number, gy: number): number;
}

const FLAT: Elevation = { hilly: false, maxLevel: 0, levelAt: () => 0 };

export function generateElevation(seed: string): Elevation {
  // Namespaced stream, like `water:`/`hills:` — adding elevation must not
  // reshuffle any other seed-derived pick.
  const rand = seededRng(`elevation:${seed}`);

  // ~40% of maps stay the classic plain, echoing water's dry/scenic rolls.
  if (rand() < 0.4) return FLAT;

  // Two low-frequency sine octaves (the hills/water recipe — no real noise).
  // Wavelengths of 30–50 wu keep quantized plateaus tens of cells across; the
  // summed gradient stays well under one threshold gap per cell, so terraces
  // step by single levels even before the lowering pass.
  const f1 = (Math.PI * 2) / (34 + rand() * 16);
  const p1 = rand() * Math.PI * 2;
  const f2 = (Math.PI * 2) / (30 + rand() * 16);
  const p2 = rand() * Math.PI * 2;
  const f3 = (Math.PI * 2) / (14 + rand() * 8);
  const p3 = rand() * Math.PI * 2;
  const f4 = (Math.PI * 2) / (12 + rand() * 8);
  const p4 = rand() * Math.PI * 2;

  const water = getWater(seed);
  const levels = new Uint8Array(GRID_SIZE * GRID_SIZE);
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const x = gx * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;
      const z = gy * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;
      // Distance to the nearest water edge (+∞ on dry maps).
      const d = water ? Math.min(water.riverDistance(x, z), -water.seaDistance(x, z)) : Infinity;
      const allowed = Math.min(MAX_LEVEL, Math.max(0, Math.floor((d - WATER_MARGIN) / SETBACK)));
      if (allowed === 0) continue;
      const h =
        Math.sin(x * f1 + p1) * Math.cos(z * f2 + p2) +
        0.35 * Math.sin(x * f3 + p3) * Math.cos(z * f4 + p4);
      // Thresholds biased so level 0 dominates — the city core wants plains.
      levels[gy * GRID_SIZE + gx] = Math.min(allowed, h > 0.95 ? 2 : h > 0.45 ? 1 : 0);
    }
  }

  // Lowering pass: cap every cell at min(4-neighbors) + 1. Lowering-only, so
  // it converges to the same fixpoint in any scan order.
  let changed = true;
  while (changed) {
    changed = false;
    for (let gy = 0; gy < GRID_SIZE; gy += 1) {
      for (let gx = 0; gx < GRID_SIZE; gx += 1) {
        const i = gy * GRID_SIZE + gx;
        if (levels[i] === 0) continue;
        const min = Math.min(
          gx > 0 ? levels[i - 1] : levels[i],
          gx < GRID_SIZE - 1 ? levels[i + 1] : levels[i],
          gy > 0 ? levels[i - GRID_SIZE] : levels[i],
          gy < GRID_SIZE - 1 ? levels[i + GRID_SIZE] : levels[i]
        );
        if (levels[i] > min + 1) {
          levels[i] = min + 1;
          changed = true;
        }
      }
    }
  }

  let maxLevel = 0;
  for (let i = 0; i < levels.length; i += 1) if (levels[i] > maxLevel) maxLevel = levels[i];
  if (maxLevel === 0) return FLAT;

  const clampIndex = (v: number) => Math.min(GRID_SIZE - 1, Math.max(0, v));
  return {
    hilly: true,
    maxLevel,
    levelAt: (gx, gy) => levels[clampIndex(gy) * GRID_SIZE + clampIndex(gx)],
  };
}

// Memoized on the seed string, the getWater pattern: placement checks run per
// frame and the renderer samples per tile — one generation per run.
let cachedSeed: string | null = null;
let cachedElevation: Elevation | null = null;

/** The run's elevation; FLAT when elevationSeed is null (old saves, demo). */
export function getElevation(elevationSeed: string | null): Elevation {
  if (elevationSeed == null) return FLAT;
  if (cachedSeed !== elevationSeed || !cachedElevation) {
    cachedElevation = generateElevation(elevationSeed);
    cachedSeed = elevationSeed;
  }
  return cachedElevation;
}

/** World-space ground height at world (x, z); out-of-grid points continue the
 * rim cell's terrace. The render side's one height sampler. */
export function groundHeight(elevation: Elevation, wx: number, wz: number): number {
  if (!elevation.hilly) return 0;
  const gx = Math.floor((wx + HALF_GRID) / CELL_SIZE);
  const gy = Math.floor((wz + HALF_GRID) / CELL_SIZE);
  return LEVEL_HEIGHT * elevation.levelAt(gx, gy);
}
