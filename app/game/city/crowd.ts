// Sim→visual mapping for the decorative citizen crowd (render/citizens.ts).
// Import-free on purpose, like water.ts — pure math, verified by crowd.check.ts.
//
// The illusion contract: at low, countable populations the street shows
// exactly `population` figures (7 people housed = 7 people out walking).
// Beyond the countable range the crowd grows sublinearly toward a hard cap —
// nobody counts 300 meeples, a lively-but-bounded crowd reads the same and
// keeps draw calls and per-frame walk work flat.

export const CROWD_TUNING = {
  /** Population up to which the crowd matches it 1:1. */
  exactMatchMax: 20,
  /** Sublinear growth factor beyond the exact-match range (× √excess). */
  damping: 6,
  /** Hard ceiling on figures, whatever the population. */
  cap: 240,
  /**
   * Walkable-network density clamp: at most one figure per this many walkable
   * cells, so a big population on a two-lane hamlet never reads as a mob.
   * Loose enough (2 cells ≈ 1 world unit of road) that it almost never binds
   * in the exact-match range — a starter road already outnumbers early pop.
   */
  cellsPerCitizen: 2,
};

/** Population→figures curve before the space clamps: 1:1 while countable,
 * sublinear beyond. Also the sim's "bustle" input (traffic.ts) — the street's
 * look and the foot-traffic bonus ride the same number. */
export function crowdCurve(population: number): number {
  const { exactMatchMax, damping } = CROWD_TUNING;
  const pop = Math.max(0, Math.round(population));
  return pop <= exactMatchMax
    ? pop
    : exactMatchMax + Math.round(damping * Math.sqrt(pop - exactMatchMax));
}

/** How many citizen figures to show for a given population and walk network. */
export function crowdSize(population: number, walkableCells: number): number {
  const { cap, cellsPerCitizen } = CROWD_TUNING;
  if (walkableCells <= 0) return 0;
  return Math.min(crowdCurve(population), cap, Math.floor(walkableCells / cellsPerCitizen));
}
