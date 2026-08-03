// Per-tile crowd density, fed by the decorative walkers (render/citizens.ts
// moves figures between cells) and sampled by the ambience around the camera
// focus. Reusable seam: bustle-dependent building output (the stall's
// footTraffic, maybe replacing traffic.ts's catchment) could later read a
// per-tile score from this same field — two blockers to resolve *then*:
// 1. Determinism/pause: figures are Math.random render-side walkers that
//    freeze on pause, so tick output reading them reverses "count is their
//    only sim coupling" (root CLAUDE.md) — needs the materials-reversal
//    treatment (seeded walkers, or a deterministic expected-density fed
//    through the same sampleAt shape).
// 2. Principle 6: per-tile density dilutes as the walk network grows — naive
//    coupling means building a road lowers a market's take
//    (traffic.check.ts asserts monotonicity). Needs a floor/monotone
//    derivation.
import { gridToWorld } from "../grid.ts";

/** Kernel reach in world units (12 cells at CELL_SIZE 0.5). */
export const BUSTLE_RADIUS = 6;
/** Kernel-sum (≈ figures at the sample point) for full 0..1 output. */
export const BUSTLE_LOCAL_FULL = 6;

type Cell = { n: number; x: number; z: number };

export function createBustleField() {
  // Sparse: only occupied cells (≤ CROWD_TUNING.cap figures), world coords
  // resolved once at insert so per-frame sampling never parses keys.
  const cells = new Map<string, Cell>();

  /** Move one figure between "x,y" cell keys; null = spawn/despawn side. */
  function move(from: string | null, to: string | null) {
    if (from === to) return;
    if (from != null) {
      const cell = cells.get(from);
      if (cell && --cell.n <= 0) cells.delete(from);
    }
    if (to != null) {
      const cell = cells.get(to);
      if (cell) {
        cell.n++;
      } else {
        const [cx, cy] = to.split(",").map(Number);
        const p = gridToWorld(cx!, cy!);
        cells.set(to, { n: 1, x: p.x, z: p.z });
      }
    }
  }

  /** 0..1 local crowd density at world (x,z): soft kernel
   * w = max(0, 1 − d²/r²) per figure, summed and normalized. */
  function sampleAt(x: number, z: number, radius = BUSTLE_RADIUS): number {
    const r2 = radius * radius;
    let sum = 0;
    for (const cell of cells.values()) {
      const dx = cell.x - x;
      const dz = cell.z - z;
      const w = 1 - (dx * dx + dz * dz) / r2;
      if (w > 0) sum += w * cell.n;
    }
    return Math.min(1, sum / BUSTLE_LOCAL_FULL);
  }

  const clear = () => cells.clear();

  /** Occupied-cell count — bookkeeping checks only. */
  const size = () => cells.size;

  return { move, sampleAt, clear, size };
}
