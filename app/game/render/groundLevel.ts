// The render side's one door to terrace heights: every mesh that stands on
// the ground (buildings, roads, walkers, ghosts, display art) samples these,
// so geometry and figures can't drift apart — the bridgeLiftAt precedent.
// Reads the run's elevationSeed live from the store; flat maps return 0.

import { getElevation, groundHeight, LEVEL_HEIGHT } from "~/game/map/elevation";
import { useGameStore } from "~/stores/useGameStore";

/** Terrace base height (world y) of a grid cell. */
export function cellGroundY(gx: number, gy: number): number {
  return LEVEL_HEIGHT * getElevation(useGameStore.getState().elevationSeed).levelAt(gx, gy);
}

/** Terrace base height (world y) under a world-space point. */
export function worldGroundY(wx: number, wz: number): number {
  return groundHeight(getElevation(useGameStore.getState().elevationSeed), wx, wz);
}

/** Drape height at a cell corner: the highest of the four touching cells —
 * a vertex-displaced sheet (the dirt overlay) hangs over cliff edges instead
 * of cutting into them. */
export function cornerGroundY(cornerX: number, cornerY: number): number {
  const elevation = getElevation(useGameStore.getState().elevationSeed);
  if (!elevation.hilly) return 0;
  return (
    LEVEL_HEIGHT *
    Math.max(
      elevation.levelAt(cornerX - 1, cornerY - 1),
      elevation.levelAt(cornerX, cornerY - 1),
      elevation.levelAt(cornerX - 1, cornerY),
      elevation.levelAt(cornerX, cornerY)
    )
  );
}
