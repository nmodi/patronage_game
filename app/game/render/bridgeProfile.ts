import { worldToGridFloat, type Tile, type TileMap } from "~/game/grid";
import { ROAD_DIAG_NE, ROAD_DIAG_NW } from "~/game/placement/roadStretch";

// Rialto hump: a contiguous bridge run's deck rises on a parabola from road
// level at both ends. Everything that stands on or renders a bridge deck
// (roadRenderer batches, citizen walkers) samples bridgeLiftAt so they can't
// drift apart. Lift is 0 at the run's outer edges, so decks meet roads flush.
const RISE_CAP = 0.16;
const RISE_PER_CELL = 0.05;
export const bridgeRise = (n: number) => Math.min(RISE_CAP, RISE_PER_CELL * n);

const openAt = (tiles: TileMap, x: number, y: number) => {
  const t = tiles[`${x},${y}`]?.type;
  return t === "road" || t === "city";
};

/** A bridge cell's run axis as a grid step. Diagonals follow their rotation;
 * cardinals travel along whichever axis the path continues on (same rule the
 * parapet rails use), x winning ties and isolated cells. */
export function bridgeStep(tiles: TileMap, tile: Tile): readonly [number, number] {
  if (tile.rotation === ROAD_DIAG_NE) return [1, 1];
  if (tile.rotation === ROAD_DIAG_NW) return [1, -1];
  const { x, y } = tile.position;
  const alongX =
    openAt(tiles, x - 1, y) ||
    openAt(tiles, x + 1, y) ||
    !(openAt(tiles, x, y - 1) || openAt(tiles, x, y + 1));
  return alongX ? [1, 0] : [0, 1];
}

function isMate(tiles: TileMap, x: number, y: number, step: readonly [number, number], rotation: number | undefined) {
  const t = tiles[`${x},${y}`];
  if (t?.buildingId !== "bridge" || t.rotation !== rotation) return false;
  const s = bridgeStep(tiles, t);
  return s[0] === step[0] && s[1] === step[1];
}

/** Deck lift above the flat bridge height at a world point (0 off-bridge).
 * Continuous along a run, so adjacent cells and walking figures agree. */
export function bridgeLiftAt(tiles: TileMap, wx: number, wz: number): number {
  const g = worldToGridFloat(wx, wz);
  const gx = Math.floor(g.x);
  const gy = Math.floor(g.y);
  const tile = tiles[`${gx},${gy}`];
  if (tile?.buildingId !== "bridge") return 0;
  const step = bridgeStep(tiles, tile);
  const [sx, sy] = step;
  let back = 0;
  let fwd = 0;
  while (isMate(tiles, gx - (back + 1) * sx, gy - (back + 1) * sy, step, tile.rotation)) back++;
  while (isMate(tiles, gx + (fwd + 1) * sx, gy + (fwd + 1) * sy, step, tile.rotation)) fwd++;
  const n = back + fwd + 1;
  // Signed distance (in steps) from the run's first cell center, projected on
  // the axis; +0.5 rebases to the run's outer edge, /n normalizes to [0,1].
  const d =
    ((g.x - 0.5 - (gx - back * sx)) * sx + (g.y - 0.5 - (gy - back * sy)) * sy) / (sx * sx + sy * sy);
  const u = Math.min(1, Math.max(0, (d + 0.5) / n));
  return bridgeRise(n) * 4 * u * (1 - u);
}
