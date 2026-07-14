// Shift-held placement assist: snap a building flush against a nearby road,
// front toward it — cardinal roads by exact flush construction, diagonal
// ribbons by a small anchor search filtered to road-kissing masks. Pure logic
// (no Babylon/store imports beyond the pure modelManifest data) so
// roadSnap.check.ts runs it under plain Node.
import {
  BUILDING_METADATA_BY_ID,
  footprintMask,
  quarterOf,
  rotatedFootprint,
  type BuildingId,
} from "./buildings.ts";
import type { GridPos, TileMap } from "./grid.ts";
import { canPlaceAt, type PlacementSnapshot } from "./placementRules.ts";
import { ROAD_DIAG_NE, ROAD_DIAG_NW } from "./roadStretch.ts";
import { getFrontDirection } from "./render/modelManifest.ts";

/** How far (in cells) from the cursor we look for road tiles. Buildings span
 * 4+ cells, so this covers "cursor over the building while its edge kisses
 * the road". */
const SNAP_RANGE = 6;

export interface SnapCandidate {
  origin: GridPos;
  rotation?: number;
}

/** Front direction (local, at rotation 0) turned by q quarter turns — the
 * integer form of the yaw map: local +X faces grid +x, −y, −x, +y. */
function rotateDirQuarter(fx: number, fz: number, q: number): [number, number] {
  switch (((q % 4) + 4) % 4) {
    case 0:
      return [fx, fz];
    case 1:
      return [fz, -fx];
    case 2:
      return [-fx, -fz];
    default:
      return [-fz, fx];
  }
}

/** Quarter rotation whose turned front equals the cardinal target, else null. */
function solveQuarter(front: [number, number], tx: number, ty: number): number | null {
  for (let q = 0; q < 4; q += 1) {
    const [a, b] = rotateDirQuarter(front[0], front[1], q);
    if (a === tx && b === ty) return q;
  }
  return null;
}

/** Diagonal rotation (4-7) whose turned front points along the (unnormalized)
 * diagonal target: turning a cardinal (a,b) by +45° gives (a+b, b−a)/√2. */
function solveDiagonal(front: [number, number], tx: number, ty: number): number | null {
  for (let q = 0; q < 4; q += 1) {
    const [a, b] = rotateDirQuarter(front[0], front[1], q);
    if (a + b === tx && b - a === ty) return 4 + q;
  }
  return null;
}

/** Whether any mask cell is orthogonally adjacent to a road cell of the given
 * ribbon orientation — the "flush" test for diagonal candidates. Matching the
 * orientation matters: a candidate rotated to face a NW lane must not qualify
 * by kissing an unrelated NE road it faces sideways-on. */
function maskTouchesRibbon(
  tiles: TileMap,
  cells: ReadonlyArray<{ x: number; y: number }>,
  ax: number,
  ay: number,
  ribbonRotation: number
) {
  const isRibbonAt = (x: number, y: number) => {
    const tile = tiles[`${x},${y}`];
    return tile?.type === "road" && tile.rotation === ribbonRotation;
  };
  for (const c of cells) {
    const x = ax + c.x;
    const y = ay + c.y;
    if (
      isRibbonAt(x + 1, y) ||
      isRibbonAt(x - 1, y) ||
      isRibbonAt(x, y + 1) ||
      isRibbonAt(x, y - 1)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Best snap placement for the building near the cursor (fractional grid
 * coords), or null — snapping never blocks free placement. Buildings with a
 * `front` rotate to face the road (45° rotations against diagonal ribbons);
 * front-less buildings position-snap against cardinal roads only, keeping
 * `fallbackRotation`.
 */
export function findRoadSnap(
  state: PlacementSnapshot,
  cursor: { x: number; y: number },
  buildingId: BuildingId,
  fallbackRotation: number | null
): SnapCandidate | null {
  const metadata = BUILDING_METADATA_BY_ID[buildingId];
  if (!metadata || metadata.type === "road" || metadata.linear) return null;
  const front = getFrontDirection(buildingId);
  const tiles = state.map.tiles;

  const cx = Math.floor(cursor.x);
  const cy = Math.floor(cursor.y);
  let best: (SnapCandidate & { score: number }) | null = null;
  const seen = new Set<string>();

  const consider = (origin: GridPos, rotation: number | undefined, center: { x: number; y: number }) => {
    const key = `${origin.x},${origin.y},${rotation ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!canPlaceAt(state, origin, buildingId, rotation)) return;
    const dx = center.x - cursor.x;
    const dy = center.y - cursor.y;
    const score = dx * dx + dy * dy;
    if (
      !best ||
      score < best.score - 1e-9 ||
      (Math.abs(score - best.score) <= 1e-9 &&
        (origin.y < best.origin.y || (origin.y === best.origin.y && origin.x < best.origin.x)))
    ) {
      best = { origin, rotation, score };
    }
  };

  for (let dy = -SNAP_RANGE; dy <= SNAP_RANGE; dy += 1) {
    for (let dx = -SNAP_RANGE; dx <= SNAP_RANGE; dx += 1) {
      const rx = cx + dx;
      const ry = cy + dy;
      const road = tiles[`${rx},${ry}`];
      if (!road || road.type !== "road") continue;

      if (road.rotation === ROAD_DIAG_NE || road.rotation === ROAD_DIAG_NW) {
        // — Diagonal ribbon: rotate 45° with the front toward the ribbon and
        // slide along it. A small anchor search around the ideal center,
        // filtered to placeable masks that actually kiss a road cell, stands
        // in for an exact flush construction (staircase flushness depends on
        // mask parity, so constructing it directly is fiddlier than searching).
        if (!front) continue; // front-less buildings snap to cardinal roads only
        const ne = road.rotation === ROAD_DIAG_NE;
        // Ribbon direction û and perpendicular v̂ (unnormalized ints ±1).
        const uInt: [number, number] = ne ? [1, 1] : [1, -1];
        const vInt: [number, number] = ne ? [1, -1] : [1, 1];
        const relX = cursor.x - (rx + 0.5);
        const relY = cursor.y - (ry + 0.5);
        const side = relX * vInt[0] + relY * vInt[1] >= 0 ? 1 : -1;
        const rotation = solveDiagonal(front, -side * vInt[0], -side * vInt[1]);
        if (rotation == null) continue;
        const mask = footprintMask(metadata, rotation);
        const halfAcross =
          (front[0] !== 0 ? metadata.footprint.width : metadata.footprint.depth) / 2;
        // Ideal center: cursor projected onto the ribbon axis, pushed out
        // perpendicular by the facade half-extent (+0.5 clearance the ±2
        // anchor search refines against the staircase).
        const along = (relX * uInt[0] + relY * uInt[1]) / 2; // rel·û in û units
        const perp = (halfAcross + 0.5) * side * Math.SQRT1_2;
        const idealX = rx + 0.5 + (along * uInt[0] + perp * vInt[0]);
        const idealY = ry + 0.5 + (along * uInt[1] + perp * vInt[1]);
        const baseX = Math.round(idealX - mask.center.x - 0.5);
        const baseY = Math.round(idealY - mask.center.y - 0.5);
        for (let ay = baseY - 2; ay <= baseY + 2; ay += 1) {
          for (let ax = baseX - 2; ax <= baseX + 2; ax += 1) {
            const key = `${ax},${ay},${rotation}`;
            if (seen.has(key)) continue;
            if (!maskTouchesRibbon(tiles, mask.cells, ax, ay, road.rotation)) {
              seen.add(key);
              continue;
            }
            consider({ x: ax, y: ay }, rotation, {
              x: ax + 0.5 + mask.center.x,
              y: ay + 0.5 + mask.center.y,
            });
          }
        }
      } else {
        // — Cardinal road cell: flush construction, one candidate per side.
        // d = direction the building's front faces (building → road).
        for (const [tx, ty] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ] as const) {
          const r = front ? solveQuarter(front, tx, ty) : quarterOf(fallbackRotation ?? undefined);
          if (r == null) continue;
          const useRotation = front ? r : (fallbackRotation ?? undefined);
          const fp = rotatedFootprint(metadata, r);
          let origin: GridPos;
          if (ty === 1) {
            origin = { x: Math.round(cursor.x - fp.width / 2), y: ry - fp.depth };
          } else if (ty === -1) {
            origin = { x: Math.round(cursor.x - fp.width / 2), y: ry + 1 };
          } else if (tx === 1) {
            origin = { x: rx - fp.width, y: Math.round(cursor.y - fp.depth / 2) };
          } else {
            origin = { x: rx + 1, y: Math.round(cursor.y - fp.depth / 2) };
          }
          consider(origin, useRotation, {
            x: origin.x + fp.width / 2,
            y: origin.y + fp.depth / 2,
          });
        }
      }
    }
  }

  if (!best) return null;
  const { origin, rotation } = best as SnapCandidate & { score: number };
  return { origin, rotation };
}
