// Plaza connectivity (design doc, Phase 10). The effect radiates from the
// Main Plaza (Town Center Plaza) through roads — including diagonal streets,
// whose staircase cells conduct through cell corners — fading with network
// distance; secondary plazas on the network refresh it to full, making them
// mini-hubs. Buildings touching the network get a graded output/progress
// bonus. A nudge, never a gate: disconnected buildings work at full base rate
// (Key Design Principle 6).

// Only imports from dependency-free sim modules: connectivity.check.ts runs
// this file under plain Node.

import { BUILDING_TYPES } from "./buildings.ts";
import { PLAZA_CONNECTION_BONUS, PLAZA_REACH } from "./constants.ts";
import type { BuildingMetadata } from "./types.ts";
export { PLAZA_CONNECTION_BONUS, PLAZA_REACH };

/** A building's plaza-connection bonus at full strength — per-building override
 * (market stall's foot-traffic coupling) falling back to the global constant. */
export const connectionBonusOf = (metadata?: BuildingMetadata): number =>
  metadata?.connectionBonus ?? PLAZA_CONNECTION_BONUS;

export const MAIN_PLAZA_ID = "town_center_plaza";
// Hubs refresh the Main Plaza's reach to full: the plazas plus any building
// tagged isHub (bell tower). Derived so the metadata flag stays honest.
export const PLAZA_IDS = new Set<string>(
  BUILDING_TYPES.filter((b) => "isHub" in b && b.isHub).map((b) => b.id)
);
// Buildings that overwrite road cells (market stall) conduct the network at
// road cost, so placing one on a 1-wide path never severs the plaza reach.
// Derived from the same placesOnRoads flag that grants the placement, so
// permission and conduction can't desync.
export const ROAD_OVERLAY_IDS = new Set<string>(
  BUILDING_TYPES.filter((b) => "placesOnRoads" in b && b.placesOnRoads).map((b) => b.id)
);

/** Minimal structural slice of the store's Tile; one entry per occupied cell. */
export interface ConnectivityTile {
  type: string;
  buildingId: string;
  origin: { x: number; y: number };
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

// Diagonal roads are thin 8-connected staircases, so the network conducts
// through cell corners too. A diagonal step costs 1 like a cardinal one —
// slightly generous vs √2, fine for a soft bonus (principle 6). Buildings
// (the strength scan below) stay 4-neighbor: corner contact isn't adjacency.
const NETWORK_NEIGHBORS = [
  ...NEIGHBORS,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/**
 * Origin keys ("x,y") of buildings receiving the plaza bonus, mapped to
 * strength in (0, 1]. Strength falls linearly from 1 next to a hub to 0 at
 * PLAZA_REACH road tiles away. Hubs: the Main Plaza plus any secondary plaza
 * reachable from it through roads (an isolated plaza radiates nothing).
 * Roads and plazas themselves are the network, not recipients.
 */
// Memoized by tiles object identity: the store replaces the tiles object on
// every change, so a hit is always current. Covers the tick's second call via
// getHousing and the per-render tooltip/TopBar calls.
const memo = new WeakMap<Record<string, ConnectivityTile>, Map<string, number>>();

export function computePlazaConnectivity(
  tiles: Record<string, ConnectivityTile>
): Map<string, number> {
  const cached = memo.get(tiles);
  if (cached) return cached;
  const result = computeUncached(tiles);
  memo.set(tiles, result);
  return result;
}

function computeUncached(tiles: Record<string, ConnectivityTile>): Map<string, number> {
  // 0-1 BFS over the network: main-plaza cells seed at distance 0, roads cost
  // 1 per tile, any plaza cell reached resets to 0 (the refresh).
  const dist = new Map<string, number>();
  const deque: string[] = [];
  for (const [key, tile] of Object.entries(tiles)) {
    if (tile.buildingId === MAIN_PLAZA_ID) {
      dist.set(key, 0);
      deque.push(key);
    }
  }
  while (deque.length > 0) {
    const key = deque.shift()!;
    const d = dist.get(key)!;
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of NETWORK_NEIGHBORS) {
      const nkey = `${x! + dx},${y! + dy}`;
      const tile = tiles[nkey];
      if (!tile) continue;
      let nd: number;
      if (PLAZA_IDS.has(tile.buildingId)) nd = 0;
      else if (tile.type === "road" || ROAD_OVERLAY_IDS.has(tile.buildingId)) nd = d + 1;
      else continue;
      if ((dist.get(nkey) ?? Infinity) <= nd) continue;
      dist.set(nkey, nd);
      if (nd === d) deque.unshift(nkey);
      else deque.push(nkey);
    }
  }

  // Building strength: best adjacent network cell, linear falloff, by origin.
  const strength = new Map<string, number>();
  for (const [key, tile] of Object.entries(tiles)) {
    if (tile.type === "road" || PLAZA_IDS.has(tile.buildingId)) continue;
    const originKey = `${tile.origin.x},${tile.origin.y}`;
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of NEIGHBORS) {
      const d = dist.get(`${x! + dx},${y! + dy}`);
      if (d == null) continue;
      const s = Math.max(0, 1 - d / PLAZA_REACH);
      if (s > (strength.get(originKey) ?? 0)) strength.set(originKey, s);
    }
  }
  return strength;
}
