// Freeform plazas (Plazas II): the gathering field and the formation detector.
//
// The field answers "would people linger here?" per cell, derived from TILES
// ONLY — no occupancy, no clocks, no walker positions — so it moves only when
// the player builds or razes: fully deterministic, replay-safe, and a formed
// plaza can never flicker between player actions. Contributions are additive
// with linear falloff, so the field is monotonic non-decreasing in houses,
// services, roads, and decorations (principle 6's spirit; asserted in
// gathering.check.ts).
//
// Formation: a plaza is a connected union of fully-open PLAZA_CORE² blocks
// (open = bare buildable land, player plaza paving, land road cells — a
// generous crossing becomes a piazza, the way real ones did — or plaza
// furniture: stalls, plinths, paved decorations like the fountain). The 4×4 core
// requirement is the minimum size AND the strip-proofing: no 3-wide avenue
// ever contains one. Blocks qualify authored (all player paving) or organic
// (mean field ≥ GATHER_FORM *and* enclosed — every outward lane hits a tile,
// water, or the map edge within PLAZA_ENCLOSE_REACH cells, because a campo is
// leftover space framed by the city, never open meadow). A region is ORGANIC
// when any of its blocks is
// field-qualified — paving never lowers the field, so paving more can never
// demote an organic plaza, and an authored court can grow INTO organic as the
// city gathers around it. Organic plazas trickle slightly more Inspiration
// (ORGANIC_PLAZA_MULT); that intrinsic edge is the entire reward — no one-time
// bonus, so raze-and-reform cycles gain nothing by construction.
//
// Everything here is derived each compute and persisted nowhere (principle 8);
// plaza naming, when it lands, brings the first persistent record.
//
// Only imports from dependency-free sim modules: gathering.check.ts runs this
// file under plain Node. connectivity.ts imports this module for hub cells,
// so this module must never import connectivity.

import { BUILDING_METADATA_BY_ID, BUILDING_TYPES } from "../buildings.ts";
import {
  GATHER_AMENITY_W,
  GATHER_FORM,
  GATHER_HOUSING_W,
  GATHER_INSPIRATION_W,
  GATHER_JUNCTION_W,
  GATHER_REACH,
  GRID_SIZE,
  ORGANIC_PLAZA_MULT,
  PLAZA_CORE,
  PLAZA_ENCLOSE_REACH,
  PLAZA_FORMED_INSPIRATION,
} from "../constants.ts";
import { getWaterCells } from "../map/water.ts";

/** Minimal structural slice of the store's Tile — connectivity.ts's
 * ConnectivityTile twin, declared here so the import points one way. */
export interface GatherTile {
  type: string;
  buildingId: string;
  origin: { x: number; y: number };
}
type Tiles = Record<string, GatherTile>;

// connectivity.ts's ROAD_OVERLAY_IDS twin (market stall, plinth) — derived the
// same way rather than imported, to keep this module below connectivity.
const ROAD_OVERLAY_IDS = new Set<string>(
  BUILDING_TYPES.filter((b) => "placesOnRoads" in b && b.placesOnRoads).map((b) => b.id)
);

// Paved decorations (fountain, obelisk, colonnade…) are plaza furniture: their
// footprints are plaza-able ground, so a fountain centred in a paved court sits
// INSIDE the piazza instead of punching a hole in it.
const PAVED_DECOR_IDS = new Set<string>(
  BUILDING_TYPES.filter((b) => b.type === "decoration" && "paved" in b && b.paved).map((b) => b.id)
);

export interface FormedPlaza {
  /** Every cell ("x,y") in the union of this plaza's qualifying core blocks. */
  cells: string[];
  /** Row-major-first cell — a stable, deterministic identity (naming's future anchor). */
  anchor: string;
  /** Some core block is field-qualified: the city gathered here (hotter trickle). */
  organic: boolean;
}

export interface GatheringState {
  /** Per-cell gathering score, indexed y * GRID_SIZE + x. */
  field: Float32Array;
  plazas: FormedPlaza[];
  /** Cell key → index into plazas, for BFS hub lookups and the overlay. */
  plazaCells: Map<string, number>;
}

const G = GRID_SIZE;

/** Additive splat: weight w falling linearly to 0 over GATHER_REACH Chebyshev
 * cells from the box [x0..x1]×[y0..y1] (full weight inside the box). */
function splat(field: Float32Array, x0: number, y0: number, x1: number, y1: number, w: number) {
  const r = GATHER_REACH;
  const yLo = Math.max(0, y0 - r + 1);
  const yHi = Math.min(G - 1, y1 + r - 1);
  const xLo = Math.max(0, x0 - r + 1);
  const xHi = Math.min(G - 1, x1 + r - 1);
  for (let y = yLo; y <= yHi; y += 1) {
    const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
    for (let x = xLo; x <= xHi; x += 1) {
      const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
      const d = dx > dy ? dx : dy;
      field[y * G + x] += w * (1 - d / r);
    }
  }
}

/** (G+1)² inclusive prefix sums so any block sums in O(1). */
function prefix(src: ArrayLike<number>): Float64Array {
  const p = new Float64Array((G + 1) * (G + 1));
  for (let y = 0; y < G; y += 1) {
    let row = 0;
    for (let x = 0; x < G; x += 1) {
      row += src[y * G + x]!;
      p[(y + 1) * (G + 1) + (x + 1)] = p[y * (G + 1) + (x + 1)]! + row;
    }
  }
  return p;
}

const blockSum = (p: Float64Array, x: number, y: number, size: number): number =>
  p[(y + size) * (G + 1) + (x + size)]! -
  p[y * (G + 1) + (x + size)]! -
  p[(y + size) * (G + 1) + x]! +
  p[y * (G + 1) + x]!;

function computeUncached(tiles: Tiles, mapSeed: string | null): GatheringState {
  const field = new Float32Array(G * G);

  // Building contributions, grouped by origin: housing capacity (people live
  // here), amenities (people visit here), and generated inspiration —
  // fountains, premade plazas, displayed-art hosts-to-be — because art and
  // ornament draw crowds (the commission-a-fountain-to-seed-a-piazza move).
  // The claimed-cell bbox handles diagonal diamonds without mask math.
  const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number; w: number }>();
  for (const [key, tile] of Object.entries(tiles)) {
    const m = BUILDING_METADATA_BY_ID[tile.buildingId as keyof typeof BUILDING_METADATA_BY_ID];
    if (!m) continue;
    const w =
      (m.housing ?? 0) * GATHER_HOUSING_W +
      (m.amenities ?? 0) * GATHER_AMENITY_W +
      (m.generates?.inspiration ?? 0) * GATHER_INSPIRATION_W;
    if (w <= 0) continue;
    const originKey = `${tile.origin.x},${tile.origin.y}`;
    const [x, y] = key.split(",").map(Number) as [number, number];
    const box = boxes.get(originKey);
    if (!box) boxes.set(originKey, { x0: x, y0: y, x1: x, y1: y, w });
    else {
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
    }
  }
  for (const b of boxes.values()) splat(field, b.x0, b.y0, b.x1, b.y1, b.w);

  // Street junctions: people pass through crossings. Streets only — plaza
  // paving is a surface, not a street; its interior cells aren't crossings.
  const isStreet = (t?: GatherTile) =>
    t != null && t.type === "road" && t.buildingId !== "plaza_paving";
  for (const [key, tile] of Object.entries(tiles)) {
    if (!isStreet(tile)) continue;
    const [x, y] = key.split(",").map(Number) as [number, number];
    const n =
      (isStreet(tiles[`${x + 1},${y}`]) ? 1 : 0) +
      (isStreet(tiles[`${x - 1},${y}`]) ? 1 : 0) +
      (isStreet(tiles[`${x},${y + 1}`]) ? 1 : 0) +
      (isStreet(tiles[`${x},${y - 1}`]) ? 1 : 0);
    if (n >= 3) splat(field, x, y, x, y, GATHER_JUNCTION_W);
  }

  // Plaza-able ground: bare buildable land, player paving, land road cells
  // (bridges excluded entirely — no piazza hangs over the river, and a land
  // causeway reads as a road, not a campo), and plaza furniture — road-overlay
  // buildings and paved decorations. Furniture counts as PAVED too: it stands
  // on/for paving, so dropping a stall, plinth, or fountain onto an authored
  // court never breaks a core and never demotes the block to unformed.
  const water = getWaterCells(mapSeed);
  const able = new Uint8Array(G * G);
  const paved = new Uint8Array(G * G);
  for (let y = 0; y < G; y += 1) {
    for (let x = 0; x < G; x += 1) {
      const key = `${x},${y}`;
      const tile = tiles[key];
      const i = y * G + x;
      if (!tile) {
        if (!water.has(key)) able[i] = 1;
      } else if (tile.buildingId === "plaza_paving") {
        able[i] = 1;
        paved[i] = 1;
      } else if (tile.type === "road" && tile.buildingId !== "bridge") {
        able[i] = 1;
      } else if (ROAD_OVERLAY_IDS.has(tile.buildingId) || PAVED_DECOR_IDS.has(tile.buildingId)) {
        able[i] = 1;
        paved[i] = 1;
      }
    }
  }

  // Enclosure for organic blocks: from each block edge, every outward lane
  // must hit a tile (building, street, paving), water, or the map edge within
  // PLAZA_ENCLOSE_REACH cells — bare meadow continuing means countryside, not
  // campo. Adding a tile only ever bounds more, so this stays monotonic.
  const bounding = (x: number, y: number) =>
    x < 0 || x >= G || y < 0 || y >= G || tiles[`${x},${y}`] != null || water.has(`${x},${y}`);
  const laneBounded = (x: number, y: number, dx: number, dy: number) => {
    for (let s = 1; s <= PLAZA_ENCLOSE_REACH; s += 1) {
      if (bounding(x + dx * s, y + dy * s)) return true;
    }
    return false;
  };
  const enclosed = (x: number, y: number): boolean => {
    for (let i = 0; i < PLAZA_CORE; i += 1) {
      if (!laneBounded(x + i, y, 0, -1)) return false; // north from the top edge
      if (!laneBounded(x + i, y + PLAZA_CORE - 1, 0, 1)) return false; // south
      if (!laneBounded(x, y + i, -1, 0)) return false; // west
      if (!laneBounded(x + PLAZA_CORE - 1, y + i, 1, 0)) return false; // east
    }
    return true;
  };

  // Qualifying core blocks → union bitmap → connected components.
  const A = prefix(able);
  const P = prefix(paved);
  const F = prefix(field);
  const C = PLAZA_CORE;
  const C2 = C * C;
  const member = new Uint8Array(G * G);
  const blocks: { x: number; y: number; organic: boolean }[] = [];
  for (let y = 0; y + C <= G; y += 1) {
    for (let x = 0; x + C <= G; x += 1) {
      if (blockSum(A, x, y, C) !== C2) continue;
      const organic = blockSum(F, x, y, C) / C2 >= GATHER_FORM && enclosed(x, y);
      const authored = blockSum(P, x, y, C) === C2;
      if (!organic && !authored) continue;
      blocks.push({ x, y, organic });
      for (let by = y; by < y + C; by += 1) {
        for (let bx = x; bx < x + C; bx += 1) member[by * G + bx] = 1;
      }
    }
  }

  const comp = new Int32Array(G * G).fill(-1);
  const plazas: FormedPlaza[] = [];
  const plazaCells = new Map<string, number>();
  const stack: number[] = [];
  for (let i = 0; i < member.length; i += 1) {
    if (!member[i] || comp[i] !== -1) continue;
    const index = plazas.length;
    const cells: string[] = [];
    // Row-major scan → the first cell is the smallest (y, x): a stable anchor.
    const anchor = `${i % G},${Math.floor(i / G)}`;
    stack.push(i);
    comp[i] = index;
    while (stack.length > 0) {
      const j = stack.pop()!;
      const x = j % G;
      const y = Math.floor(j / G);
      cells.push(`${x},${y}`);
      plazaCells.set(`${x},${y}`, index);
      for (const k of [x > 0 ? j - 1 : -1, x < G - 1 ? j + 1 : -1, j - G, j + G]) {
        if (k < 0 || k >= member.length || !member[k] || comp[k] !== -1) continue;
        comp[k] = index;
        stack.push(k);
      }
    }
    plazas.push({ cells, anchor, organic: false });
  }
  for (const b of blocks) {
    if (b.organic) plazas[comp[b.y * G + b.x]!]!.organic = true;
  }

  return { field, plazas, plazaCells };
}

// Memoized by tiles object identity (the store replaces the tiles object on
// every change), with the seed kept alongside — it's fixed within a run, but
// check scenarios reuse shapes across seeds.
const memo = new WeakMap<Tiles, { seed: string | null; state: GatheringState }>();

export function computeGathering(tiles: Tiles, mapSeed: string | null): GatheringState {
  const hit = memo.get(tiles);
  if (hit && hit.seed === mapSeed) return hit.state;
  const state = computeUncached(tiles, mapSeed);
  memo.set(tiles, { seed: mapSeed, state });
  return state;
}

/** One formed plaza's monthly Inspiration trickle — the tooltip surfaces this
 * per plaza, the tick sums it, so the two can't drift. */
export const plazaInspiration = (organic: boolean): number =>
  PLAZA_FORMED_INSPIRATION * (organic ? ORGANIC_PLAZA_MULT : 1);

/** The tick's formed-plaza Inspiration term: flat per plaza (the premade
 * plazas' model — workerless, boost-free), organic ones slightly hotter. */
export function formedPlazaInspiration(tiles: Tiles, mapSeed: string | null): number {
  let sum = 0;
  for (const plaza of computeGathering(tiles, mapSeed).plazas) {
    sum += plazaInspiration(plaza.organic);
  }
  return sum;
}
