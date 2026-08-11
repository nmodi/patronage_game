// Terrain elevation: a seeded, *smooth* rolling height field over the
// buildable grid — the countryside hills' language brought inside, gentler —
// derived like water: the store persists only `elevationSeed`, the field is
// recomputed from it here. No terraces, no cliffs: hilly maps roll one of two
// characters — a broad swell (wavelength past the grid: big end-to-end relief,
// negligible per-cell slope) with a little local texture, or pure rolling
// hills — so slopes stay walkable and the render side can drape roads,
// walkers, and foundations over one continuous surface.
//
// Invariants the rest of the game leans on:
// - The field is 0 within WATER_MARGIN of any water edge and climbs away
//   from it under a BANK_SLOPE cone — banks, bridges, and the water render
//   pipeline stay on the flat plain they were built for.
// - Slopes are bounded (gentle octaves; elevation.check.ts asserts the
//   finite-difference gradient), so a one-cell step is always rampable.
// - The field is sized so no real footprint ever trips MAX_BUILD_SPREAD
//   (elevation.check.ts asserts the cathedral worst case) — the placement
//   gate survives only as a backstop against future field changes.
// - `elevationSeed: null` (pre-v13 saves, demo) = the flat classic map.

import { CELL_SIZE, GRID_SIZE } from "../constants.ts";
import { seededRng } from "../random.ts";
import { getWater } from "./water.ts";

const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;

/** The broad swell (sloped maps only): one end of the map can sit this much
 * above the other (wavelengths well past the grid, so it reads as a regional
 * slope, not a hill). Big total relief, tiny per-cell gradient — placement
 * never notices. */
const BROAD_RISE = 2.5;
/** Local rolling texture on top of the swell — kept small so no footprint,
 * even the cathedral's, ever trips MAX_BUILD_SPREAD (elevation.check.ts
 * asserts it empirically). */
const LOCAL_RISE = 0.3;
/** Rolling-hills maps (no swell) carry all their relief in the local octave —
 * bigger, so they don't read as flat, still under the gate everywhere. */
const ROLLING_RISE = 0.7;
/** Plains keep a whisper of ripple — visual realism, imperceptible to
 * placement. Truly dead-flat ground survives only for `elevationSeed: null`
 * (pre-elevation saves, demo), which must never shift. */
const RIPPLE_RISE = 0.15;
/** Tallest possible in-grid height (world units). The decorative countryside
 * runs 0.4–5.6; the buildable field stays under it. */
export const MAX_RISE = BROAD_RISE + LOCAL_RISE;
/** Land within this world distance of a water edge stays at height 0... */
const WATER_MARGIN = 1.5;
/** ...and beyond it height is clamped under a cone rising at this slope
 * (wu height per wu distance) from the water's edge. A slope cap — not a
 * fade — so the bank transition stays placement-gentle no matter how tall
 * the broad swell is: spread over even a cathedral footprint (~13 wu) is
 * ≤ ~0.33, under MAX_BUILD_SPREAD. */
const BANK_SLOPE = 0.03;
/** Max height spread (world units) across a building footprint. Roughly a
 * storey — the podium skirt (0.9 tall) absorbs it; only the steepest hillsides
 * refuse a cathedral. */
export const MAX_BUILD_SPREAD = 0.5;

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

  // Three characters (echoing water's archetype roll): ~40% plains (near-flat,
  // just a ripple of realism), ~30% rolling hills (all relief in the local
  // octave), ~30% sloped — a broad swell whose wavelengths run well past the
  // grid (~120 wu), big end-to-end relief reading as one regional slope, with
  // a little local texture on top. All stay gentle: amplitude/wavelength is
  // sized so even a cathedral footprint's spread stays under MAX_BUILD_SPREAD
  // (asserted in elevation.check.ts).
  const roll = rand();
  const broadRise = roll < 0.7 ? 0 : BROAD_RISE;
  const localRise = roll < 0.4 ? RIPPLE_RISE : roll < 0.7 ? ROLLING_RISE : LOCAL_RISE;
  const f1 = (Math.PI * 2) / (280 + rand() * 120);
  const p1 = rand() * Math.PI * 2;
  const f2 = (Math.PI * 2) / (280 + rand() * 120);
  const p2 = rand() * Math.PI * 2;
  const f3 = (Math.PI * 2) / (45 + rand() * 15);
  const p3 = rand() * Math.PI * 2;
  const f4 = (Math.PI * 2) / (40 + rand() * 15);
  const p4 = rand() * Math.PI * 2;

  const water = getWater(seed);
  const heightAt = (x: number, z: number) => {
    // Each term ∈ [-1, 1] → its own [0, rise] band; sum ≤ MAX_RISE.
    let h =
      ((Math.sin(x * f1 + p1) * Math.cos(z * f2 + p2) + 1) / 2) * broadRise +
      ((Math.sin(x * f3 + p3) * Math.cos(z * f4 + p4) + 1) / 2) * localRise;
    if (water) {
      const d = Math.min(water.riverDistance(x, z), -water.seaDistance(x, z));
      h = Math.min(h, Math.max(0, d - WATER_MARGIN) * BANK_SLOPE);
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
