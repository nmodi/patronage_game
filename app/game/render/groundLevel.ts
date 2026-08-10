// The render side's one door to ground height: BabylonCanvas registers the
// terrain mesh's own bilinear sampler (surfaceAt) here at init, and every
// mesh that stands on the ground — buildings, roads, walkers, ghosts,
// display art, dirt chunks — reads through these, so geometry and figures
// can't drift from the rendered surface (the bridgeLiftAt precedent).
// Flat maps sample the flat plain and everything returns 0, as before hills.

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";

let sampler: ((x: number, z: number) => number) | null = null;

/** Registered by BabylonCanvas once the terrain exists (before any tile
 * renders); cleared on dispose. */
export function setGroundSampler(next: ((x: number, z: number) => number) | null) {
  sampler = next;
}

/** Ground height (world y) under a world-space point. Clamped at 0 so the
 * water carve (negative surface near banks) keeps objects on the plain. */
export function worldGroundY(wx: number, wz: number): number {
  return sampler ? Math.max(0, sampler(wx, wz)) : 0;
}

/** Ground height at a grid cell's center. */
export function cellGroundY(gx: number, gy: number): number {
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  return worldGroundY(gx * CELL_SIZE - halfGrid + CELL_SIZE / 2, gy * CELL_SIZE - halfGrid + CELL_SIZE / 2);
}

/** Seat and lowest ground under a building footprint (world center + half
 * extents): the base sits at `seat` (the highest sample, so walls never
 * bury) and a foundation skirt covers down past `min` on sloped ground.
 * Samples a grid at ≤1 wu spacing so large footprints can't miss a rise. */
export function footprintGroundRange(
  cx: number,
  cz: number,
  halfW: number,
  halfD: number
): { seat: number; min: number } {
  let seat = 0;
  let min = Infinity;
  const stepsX = Math.max(2, Math.ceil(halfW * 2));
  const stepsZ = Math.max(2, Math.ceil(halfD * 2));
  for (let i = 0; i <= stepsX; i += 1) {
    for (let j = 0; j <= stepsZ; j += 1) {
      const h = worldGroundY(cx - halfW + (i / stepsX) * halfW * 2, cz - halfD + (j / stepsZ) * halfD * 2);
      if (h > seat) seat = h;
      if (h < min) min = h;
    }
  }
  return { seat, min: Math.min(min, seat) };
}
