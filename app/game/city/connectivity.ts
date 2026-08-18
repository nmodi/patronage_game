// Plaza connectivity (design doc, Phase 10). The effect radiates from the
// Main Plaza (Town Center Plaza) through roads — including diagonal streets,
// whose staircase cells conduct through cell corners — fading with network
// distance; secondary plazas on the network refresh it to full, making them
// mini-hubs. Buildings touching the network get a graded output/progress
// bonus. A nudge, never a gate: disconnected buildings work at full base rate
// (Key Design Principle 6).

// Only imports from dependency-free sim modules: connectivity.check.ts runs
// this file under plain Node.

import { BUILDING_TYPES } from "../buildings.ts";
import {
  GRID_SIZE,
  PLAZA_CAMPO_HALF,
  PLAZA_CAMPO_PAVED_FRACTION,
  PLAZA_CONNECTION_BONUS,
  PLAZA_HUB_PAVED_FRACTION,
  PLAZA_HUB_RING,
  PLAZA_REACH,
} from "../constants.ts";
import type { BuildingMetadata } from "../types.ts";
export {
  PLAZA_CAMPO_HALF,
  PLAZA_CAMPO_PAVED_FRACTION,
  PLAZA_CONNECTION_BONUS,
  PLAZA_HUB_PAVED_FRACTION,
  PLAZA_HUB_RING,
  PLAZA_REACH,
};

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

// --- Freeform plaza hubs (derived each compute, persisted nowhere) ----------
// Hub status is a local openness check, never region area: monotonic by
// construction (laying more paving only ever turns hubs on — principle 6) and
// strip-proof (no cell of a 1-wide run has a mostly-paved window). Two routes:
// a centerpiece with a mostly-paved surround, or a bare campo cell whose
// window is almost fully paved. Threshold slack means furnishing a piazza
// (stalls, plinths) never un-hubs it.
export const CENTERPIECE_IDS = new Set<string>(["fountain", "obelisk", "sculpture_display"]);

// Paved-ground predicate, the sim-side mirror of mapRenderer's pavedCells:
// paved roads (not packed earth, not bridges hanging over water) plus any
// cell claimed by a paved-flag building — so a piazza's own furnishings count
// *for* its window rather than against it. Derived like PLAZA_IDS.
const PAVED_BUILDING_IDS = new Set<string>(
  BUILDING_TYPES.filter((b) => "paved" in b && b.paved).map((b) => b.id)
);

/** Minimal structural slice of the store's Tile; one entry per occupied cell. */
export interface ConnectivityTile {
  type: string;
  buildingId: string;
  origin: { x: number; y: number };
}

const isPavedGround = (tile?: ConnectivityTile): boolean =>
  tile == null
    ? false
    : tile.type === "road"
      ? tile.buildingId !== "dirt_path" && tile.buildingId !== "bridge"
      : PAVED_BUILDING_IDS.has(tile.buildingId);

/** Paved share of a cell window, clamped to the grid (map-edge piazzas aren't
 * penalized for cells that can never exist). */
function windowPaved(
  tiles: Record<string, ConnectivityTile>,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { paved: number; total: number } {
  let paved = 0;
  let total = 0;
  for (let x = Math.max(0, x0); x <= Math.min(GRID_SIZE - 1, x1); x += 1) {
    for (let y = Math.max(0, y0); y <= Math.min(GRID_SIZE - 1, y1); y += 1) {
      total += 1;
      if (isPavedGround(tiles[`${x},${y}`])) paved += 1;
    }
  }
  return { paved, total };
}

/** Cells that qualify as piazza hubs this compute: every claimed cell of a
 * sufficiently-surrounded centerpiece, plus any campo cell whose own window is
 * almost fully paved. The BFS treats them exactly like prefab plaza cells —
 * distance resets to 0 when reached (isolated piazzas radiate nothing). */
function computeHubCells(tiles: Record<string, ConnectivityTile>): Set<string> {
  const hubCells = new Set<string>();
  const centerpieces = new Map<
    string,
    { x0: number; y0: number; x1: number; y1: number; cells: string[] }
  >();
  const pavingKeys: string[] = [];
  for (const [key, tile] of Object.entries(tiles)) {
    if (tile.buildingId === "plaza_paving") pavingKeys.push(key);
    if (!CENTERPIECE_IDS.has(tile.buildingId)) continue;
    const originKey = `${tile.origin.x},${tile.origin.y}`;
    const [x, y] = key.split(",").map(Number) as [number, number];
    const c = centerpieces.get(originKey);
    if (!c) centerpieces.set(originKey, { x0: x, y0: y, x1: x, y1: y, cells: [key] });
    else {
      c.x0 = Math.min(c.x0, x);
      c.y0 = Math.min(c.y0, y);
      c.x1 = Math.max(c.x1, x);
      c.y1 = Math.max(c.y1, y);
      c.cells.push(key);
    }
  }
  for (const c of centerpieces.values()) {
    // Claimed-cell bbox inflated by the ring — grouping claimed cells by
    // origin handles diagonal diamonds exactly, no mask math needed.
    const { paved, total } = windowPaved(
      tiles,
      c.x0 - PLAZA_HUB_RING,
      c.y0 - PLAZA_HUB_RING,
      c.x1 + PLAZA_HUB_RING,
      c.y1 + PLAZA_HUB_RING
    );
    if (paved / total >= PLAZA_HUB_PAVED_FRACTION) for (const k of c.cells) hubCells.add(k);
  }
  for (const key of pavingKeys) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const { paved, total } = windowPaved(
      tiles,
      x - PLAZA_CAMPO_HALF,
      y - PLAZA_CAMPO_HALF,
      x + PLAZA_CAMPO_HALF,
      y + PLAZA_CAMPO_HALF
    );
    if (paved / total >= PLAZA_CAMPO_PAVED_FRACTION) hubCells.add(key);
  }
  return hubCells;
}

/** A centerpiece's piazza-hub window status, for the hover tooltip ("Piazza
 * hub: N/M paved cells"). Shares the pre-pass thresholds; null for anything
 * that isn't a centerpiece origin. O(tiles) per call — hover-path only. */
export function hubRingStatus(
  tiles: Record<string, ConnectivityTile>,
  originKey: string
): { paved: number; total: number; qualified: boolean } | null {
  const origin = tiles[originKey];
  if (!origin || !CENTERPIECE_IDS.has(origin.buildingId)) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [key, tile] of Object.entries(tiles)) {
    if (
      tile.buildingId !== origin.buildingId ||
      `${tile.origin.x},${tile.origin.y}` !== originKey
    ) {
      continue;
    }
    const [x, y] = key.split(",").map(Number) as [number, number];
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const { paved, total } = windowPaved(
    tiles,
    x0 - PLAZA_HUB_RING,
    y0 - PLAZA_HUB_RING,
    x1 + PLAZA_HUB_RING,
    y1 + PLAZA_HUB_RING
  );
  return { paved, total, qualified: paved / total >= PLAZA_HUB_PAVED_FRACTION };
}

export const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

// Diagonal roads are thin 8-connected staircases, so the network conducts
// through cell corners too. A diagonal step costs 1 like a cardinal one —
// slightly generous vs √2, fine for a soft bonus (principle 6). Buildings
// (the strength scan below) stay 4-neighbor: corner contact isn't adjacency.
export const NETWORK_NEIGHBORS = [
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
  const hubCells = computeHubCells(tiles);
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
      if (PLAZA_IDS.has(tile.buildingId) || hubCells.has(nkey)) nd = 0;
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
