// Terrain elevation: a seeded, *smooth* rolling height field over the
// buildable grid — the countryside hills' language brought inside, gentler —
// derived like water: the store persists only `elevationSeed`, the field is
// recomputed from it here. No terraces, no cliffs: two long sine octaves plus
// a weak short one, so slopes stay walkable and the render side can drape
// roads, walkers, and foundations over one continuous surface.
//
// Invariants the rest of the game leans on:
// - The field is 0 within WATER_MARGIN of any water edge and fades in over
//   FADE_RUN — banks, bridges, and the water render pipeline stay on the
//   flat plain they were built for.
// - Slopes are bounded (gentle octaves; elevation.check.ts asserts the
//   finite-difference gradient), so a one-cell step is always rampable.
// - Buildings need *flat-enough* ground: footprint height spread ≤
//   MAX_BUILD_SPREAD (placementRules.ts) — big footprints need flatter
//   ground than cottages. Roads and walkers just follow the surface.
// - `elevationSeed: null` (pre-v13 saves, demo) = the flat classic map.

import { CELL_SIZE, GRID_SIZE } from "../constants.ts";
import { seededRng, smoothstep01 } from "../random.ts";
import { getWater } from "./water.ts";

const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;

/** Tallest in-grid rise (world units). The decorative countryside runs 0.4–5.6;
 * the buildable field stays well under it so the city reads on rolling ground,
 * not mountainsides. */
export const MAX_RISE = 1.2;
/** Land within this world distance of a water edge stays at height 0... */
const WATER_MARGIN = 1.5;
/** ...and the field fades in over this run beyond the margin — long, so the
 * fade's own gradient stays gentler than the field's. */
const FADE_RUN = 10;
/** Max height spread (world units) across a building footprint. Roughly half
 * a storey — cottages fit most slopes, a cathedral needs a real flat. */
export const MAX_BUILD_SPREAD = 0.25;

export interface Elevation {
  hilly: boolean;
  /** Smooth ground height (≥ 0) at world (x, z); defined everywhere so the
   * countryside continues the field past the grid edge. 0 on flat maps. */
  heightAt(x: number, z: number): number;
}

const FLAT: Elevation = { hilly: false, heightAt: () => 0 };

export function generateElevation(seed: string): Elevation {
  // Namespaced stream, like `water:`/`hills:` — adding elevation must not
  // reshuffle any other seed-derived pick.
  const rand = seededRng(`elevation:${seed}`);

  // ~40% of maps stay the classic plain, echoing water's dry/scenic rolls.
  if (rand() < 0.4) return FLAT;

  // Two long octaves carry the hills, a weak short one breaks their symmetry.
  // Wavelengths of 40–60 wu keep crests far apart and gradients gentle.
  const f1 = (Math.PI * 2) / (45 + rand() * 15);
  const p1 = rand() * Math.PI * 2;
  const f2 = (Math.PI * 2) / (40 + rand() * 15);
  const p2 = rand() * Math.PI * 2;
  const f3 = (Math.PI * 2) / (18 + rand() * 8);
  const p3 = rand() * Math.PI * 2;
  const f4 = (Math.PI * 2) / (16 + rand() * 8);
  const p4 = rand() * Math.PI * 2;

  const water = getWater(seed);
  const heightAt = (x: number, z: number) => {
    const n =
      Math.sin(x * f1 + p1) * Math.cos(z * f2 + p2) +
      0.25 * Math.sin(x * f3 + p3) * Math.cos(z * f4 + p4);
    // n ∈ [-1.25, 1.25] → h ∈ [0, MAX_RISE].
    let h = ((n + 1.25) / 2.5) * MAX_RISE;
    if (water) {
      const d = Math.min(water.riverDistance(x, z), -water.seaDistance(x, z));
      h *= smoothstep01((d - WATER_MARGIN) / FADE_RUN);
    }
    return h;
  };
  return { hilly: true, heightAt };
}

// Memoized on the seed string, the getWater pattern: placement checks run per
// frame and the renderer samples per vertex — one generation per run.
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

/** Center of a grid cell in world coordinates (the water.ts transform). */
export function cellCenter(g: number): number {
  return g * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;
}

/** Height spread (max − min) across a footprint's cell centers — the
 * placement gate's number, shared so tooltip/UI math can't drift. */
export function footprintSpread(
  elevation: Elevation,
  origin: { x: number; y: number },
  cells: ReadonlyArray<{ x: number; y: number }>
): number {
  if (!elevation.hilly) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const offset of cells) {
    const h = elevation.heightAt(cellCenter(origin.x + offset.x), cellCenter(origin.y + offset.y));
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return max - min;
}
