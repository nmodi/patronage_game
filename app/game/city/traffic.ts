// Foot traffic for footTraffic-flagged buildings (the market stall): the
// plaza-connection bonus additionally scales by real traffic —
//
//   boost = 1 + connectionBonus × hubStrength × bustle × catchment
//
// bustle: citywide, the decorative-crowd curve normalized, so the street's
// visible crowd and the stall's take agree. catchment: housing capacity
// within walking reach of the stall along the network. Both are 0..1 and
// monotonic non-decreasing in population, roads, and houses — adding
// something never lowers anyone's output (Key Design Principle 6), and the
// floor everywhere is base rate. Derived per call, tooltip-only: no per-tile
// state, no save changes (principle 8).
//
// Only imports from dependency-free sim modules: traffic.check.ts runs this
// file under plain Node.

import { BUILDING_METADATA_BY_ID } from "../buildings.ts";
import {
  NEIGHBORS,
  NETWORK_NEIGHBORS,
  PLAZA_IDS,
  ROAD_OVERLAY_IDS,
  type ConnectivityTile,
} from "./connectivity.ts";
import { BUSTLE_FULL, CATCHMENT_FULL, CATCHMENT_REACH } from "../constants.ts";
import { crowdCurve } from "./crowd.ts";
import type { BuildingMetadata } from "../types.ts";
export { BUSTLE_FULL, CATCHMENT_FULL, CATCHMENT_REACH };

const metadataOf = (buildingId: string): BuildingMetadata | undefined =>
  (BUILDING_METADATA_BY_ID as Record<string, BuildingMetadata | undefined>)[buildingId];

/** Citywide bustle 0..1: the visible-crowd population curve, normalized.
 * Deliberately skips crowdSize's walkable-cell clamp — that's a render
 * mob-guard, and dividing by network size would punish road-building. */
export const bustle = (population: number): number =>
  Math.min(1, crowdCurve(population) / BUSTLE_FULL);

// Same network rule as the connectivity BFS: roads, road-overlay buildings
// (stalls themselves), and plaza/hub cells all carry walkers.
const isNetworkCell = (t: ConnectivityTile) =>
  t.type === "road" || ROAD_OVERLAY_IDS.has(t.buildingId) || PLAZA_IDS.has(t.buildingId);

/**
 * footTraffic-flagged origin keys ("x,y") → catchment 0..1: base housing
 * capacity within CATCHMENT_REACH network cells, over CATCHMENT_FULL.
 * Honest walking distance — unlike the connectivity BFS, plazas conduct at
 * road cost with no reset-to-0 (hub pull is already its own factor).
 */
// Memoized by tiles object identity like computePlazaConnectivity: the store
// replaces the tiles object on every change, so a hit is always current.
// Population never enters here — it's applied outside, in trafficFactor.
const memo = new WeakMap<Record<string, ConnectivityTile>, Map<string, number>>();

export function computeCatchment(
  tiles: Record<string, ConnectivityTile>
): Map<string, number> {
  const cached = memo.get(tiles);
  if (cached) return cached;
  const result = new Map<string, number>();
  const seedsByOrigin = new Map<string, string[]>();
  for (const [key, tile] of Object.entries(tiles)) {
    if (!metadataOf(tile.buildingId)?.footTraffic) continue;
    const originKey = `${tile.origin.x},${tile.origin.y}`;
    seedsByOrigin.set(originKey, [...(seedsByOrigin.get(originKey) ?? []), key]);
  }
  for (const [originKey, seeds] of seedsByOrigin) {
    result.set(originKey, catchmentFrom(tiles, seeds));
  }
  memo.set(tiles, result);
  return result;
}

function catchmentFrom(tiles: Record<string, ConnectivityTile>, seeds: string[]): number {
  // Plain FIFO BFS (uniform step cost — no 0-1 deque needed), walked by index
  // so there's no O(n) shift. Bounded: at most (2·CATCHMENT_REACH+1)² cells.
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const key of seeds) {
    dist.set(key, 0);
    queue.push(key);
  }
  // Housing 4-adjacent to any reached cell, deduped by origin so a multi-cell
  // house counts once however many road cells touch it. Corner contact isn't
  // adjacency — same rule as connectivity's strength scan.
  const housed = new Map<string, number>();
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i]!;
    const d = dist.get(key)!;
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of NEIGHBORS) {
      const t = tiles[`${x! + dx},${y! + dy}`];
      const housing = t ? metadataOf(t.buildingId)?.housing ?? 0 : 0;
      if (t && housing > 0) housed.set(`${t.origin.x},${t.origin.y}`, housing);
    }
    if (d >= CATCHMENT_REACH) continue;
    for (const [dx, dy] of NETWORK_NEIGHBORS) {
      const nkey = `${x! + dx},${y! + dy}`;
      if (dist.has(nkey)) continue;
      const t = tiles[nkey];
      if (!t || !isNetworkCell(t)) continue;
      dist.set(nkey, d + 1);
      queue.push(nkey);
    }
  }
  let capacity = 0;
  for (const housing of housed.values()) capacity += housing;
  return Math.min(1, capacity / CATCHMENT_FULL);
}

/** The 0..1 traffic factor multiplying a building's plaza bonus — 1 for
 * unflagged buildings, bustle × catchment for footTraffic ones. */
export function trafficFactor(
  metadata: BuildingMetadata | undefined,
  originKey: string,
  tiles: Record<string, ConnectivityTile>,
  population: number
): number {
  if (!metadata?.footTraffic) return 1;
  return bustle(population) * (computeCatchment(tiles).get(originKey) ?? 0);
}
