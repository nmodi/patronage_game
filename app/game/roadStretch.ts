// Road drag rasterization: octant snap + diagonal staircase cells.
// No Babylon or store imports: roadStretch.check.ts runs this under plain Node.
import { GRID_SIZE } from "./constants.ts";
import type { GridPos } from "./grid.ts";

// Paved road tiles store their ribbon orientation in Tile.rotation:
// undefined = cardinal (unrotated quad — exactly the pre-diagonal behavior,
// so old saves are untouched), ROAD_DIAG_NE = grid direction ±(1,1),
// ROAD_DIAG_NW = ±(1,-1). Only two values exist because the road decal is
// 180°-symmetric; 1/3 mirror "odd quarter-turn" so any footprint math
// (a no-op on 1×1) stays coherent.
export const ROAD_DIAG_NE = 1;
export const ROAD_DIAG_NW = 3;
export type RoadRotation = typeof ROAD_DIAG_NE | typeof ROAD_DIAG_NW;

export interface RoadStretch {
  positions: GridPos[];
  rotation?: RoadRotation;
}

export function buildRoadStretch(
  anchor: GridPos,
  hover: GridPos,
  width: number,
  allowDiagonal: boolean
): RoadStretch {
  const dx = hover.x - anchor.x;
  const dy = hover.y - anchor.y;
  const positions: GridPos[] = [];

  // No drag direction yet — a width×width block under the cursor, so the
  // ghost shows the road's true size before the axis is known.
  if (dx === 0 && dy === 0) {
    for (let wx = 0; wx < width; wx += 1) {
      for (let wy = 0; wy < width; wy += 1) {
        positions.push({ x: anchor.x + wx, y: anchor.y + wy });
      }
    }
    return { positions };
  }

  if (allowDiagonal) {
    // Snap to the nearest of 8 octants (equal 45° sectors, edges at 22.5°).
    const octant = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    if (octant % 2 === 1) {
      const sx = octant === 1 || octant === 7 ? 1 : -1;
      const sy = octant === 1 || octant === 3 ? 1 : -1;
      // Run length: the drag projected onto the snapped ray, in diagonal
      // steps, clamped so the spine stays on the map. Width rows may still
      // poke off the +x edge — planLinearPlacement rejects those (red ghost),
      // matching cardinal edge behavior.
      let n = Math.max(1, Math.round((dx * sx + dy * sy) / 2));
      n = Math.min(n, sx > 0 ? GRID_SIZE - 1 - anchor.x : anchor.x);
      n = Math.min(n, sy > 0 ? GRID_SIZE - 1 - anchor.y : anchor.y);
      // Extra width stamps rows offset +1 along x (keeps the cell set
      // orthogonally contiguous; a perpendicular-diagonal offset would leave
      // hole cells and visual gaps between ribbons).
      for (let i = 0; i <= n; i += 1) {
        for (let w = 0; w < width; w += 1) {
          positions.push({ x: anchor.x + i * sx + w, y: anchor.y + i * sy });
        }
      }
      return { positions, rotation: sx === sy ? ROAD_DIAG_NE : ROAD_DIAG_NW };
    }
  }

  // Cardinal: dominant axis; extra width stamps on the positive side of the
  // drag line, matching footprint-origin semantics.
  if (Math.abs(dx) >= Math.abs(dy)) {
    const step = dx >= 0 ? 1 : -1;
    for (let x = anchor.x; x !== hover.x + step; x += step) {
      for (let w = 0; w < width; w += 1) positions.push({ x, y: anchor.y + w });
    }
  } else {
    const step = dy >= 0 ? 1 : -1;
    for (let y = anchor.y; y !== hover.y + step; y += step) {
      for (let w = 0; w < width; w += 1) positions.push({ x: anchor.x + w, y });
    }
  }
  return { positions };
}
