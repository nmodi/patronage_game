// Self-check for the gathering field + freeform plaza formation.
// Run: node --experimental-strip-types app/game/city/gathering.check.ts
import assert from "node:assert";

import { stamp, tile } from "../checkHelpers.ts";
import {
  GATHER_FORM,
  GRID_SIZE,
  ORGANIC_PLAZA_MULT,
  PLAZA_CORE,
  PLAZA_FORMED_INSPIRATION,
} from "../constants.ts";
import type { TileMap } from "../grid.ts";
import { getWaterCells } from "../map/water.ts";
import { computeGathering, formedPlazaInspiration } from "./gathering.ts";

const merge = (...maps: TileMap[]): TileMap => Object.assign({}, ...maps);

/** A rect of plaza paving (or any 1×1-cell surface id). */
function surface(buildingId: "plaza_paving" | "road" | "bridge", x0: number, y0: number, w: number, d: number): TileMap {
  const tiles: TileMap = {};
  for (let x = x0; x < x0 + w; x += 1) {
    for (let y = y0; y < y0 + d; y += 1) {
      tiles[`${x},${y}`] = tile(buildingId, x, y);
    }
  }
  return tiles;
}

/** A lively quarter around the open block at (bx..bx+3, by..by+3): four
 * cottages hugging its sides plus a tavern — comfortably over GATHER_FORM. */
function quarterAround(bx: number, by: number): TileMap {
  return merge(
    stamp("cottage", { x: bx - 4, y: by }), // left
    stamp("cottage", { x: bx + PLAZA_CORE, y: by }), // right
    stamp("cottage", { x: bx, y: by - 4 }), // top
    stamp("cottage", { x: bx, y: by + PLAZA_CORE }), // bottom
    stamp("tavern", { x: bx - 4, y: by + PLAZA_CORE + 4 })
  );
}

// Empty map: zero field, no plazas.
{
  const g = computeGathering({}, null);
  assert.equal(g.plazas.length, 0);
  assert.ok(g.field.every((v) => v === 0));
}

// Authored formation: a lone 4×4 paved rect forms one non-organic plaza.
{
  const g = computeGathering(surface("plaza_paving", 40, 40, 4, 4), null);
  assert.equal(g.plazas.length, 1);
  assert.equal(g.plazas[0]!.organic, false);
  assert.equal(g.plazas[0]!.cells.length, 16);
  assert.equal(g.plazas[0]!.anchor, "40,40");
  assert.equal(formedPlazaInspiration(surface("plaza_paving", 40, 40, 4, 4), null), PLAZA_FORMED_INSPIRATION);
}

// Strip-proof by construction: a 3-wide paved avenue never forms, however long.
{
  const g = computeGathering(surface("plaza_paving", 10, 10, 3, 24), null);
  assert.equal(g.plazas.length, 0);
}

// Non-rectangular: two overlapping paved 4×4s merge into ONE L-shaped plaza.
{
  const tiles = merge(surface("plaza_paving", 40, 40, 4, 4), surface("plaza_paving", 43, 43, 4, 4));
  const g = computeGathering(tiles, null);
  assert.equal(g.plazas.length, 1);
  assert.equal(g.plazas[0]!.cells.length, Object.keys(tiles).length);
}

// Organic formation: a lively quarter forms a plaza on BARE ground; a lone
// cottage doesn't (the countryside never spontaneously qualifies).
{
  const hot = computeGathering(quarterAround(60, 60), null);
  assert.equal(hot.plazas.length, 1);
  assert.equal(hot.plazas[0]!.organic, true);
  assert.ok(hot.plazas[0]!.cells.includes("60,60"));
  const sparse = computeGathering(stamp("cottage", { x: 56, y: 60 }), null);
  assert.equal(sparse.plazas.length, 0);
}

// Roads convert: the same quarter around a 4×4 of road cells forms a plaza
// over the crossing — but never over bridge decks.
{
  const onRoads = computeGathering(merge(quarterAround(60, 60), surface("road", 60, 60, 4, 4)), null);
  assert.equal(onRoads.plazas.length, 1);
  assert.ok(onRoads.plazaCells.has("61,61"));
  const onBridge = computeGathering(merge(quarterAround(60, 60), surface("bridge", 60, 60, 4, 4)), null);
  assert.equal(onBridge.plazas.length, 0);
}

// A market stall in the campo never breaks the core (road-overlay cells are
// plaza-able ground).
{
  const tiles = merge(quarterAround(60, 60), { "61,61": tile("market_stall", 61, 61) });
  assert.ok(computeGathering(tiles, null).plazaCells.has("61,61"));
}

// Organic status is a field property, not a paving property: fully paving the
// hot block keeps it organic (paving more never demotes a plaza), while the
// same paving alone in the void stays authored-rate.
{
  const paved = surface("plaza_paving", 60, 60, 4, 4);
  const embraced = computeGathering(merge(quarterAround(60, 60), paved), null);
  assert.equal(embraced.plazas[0]!.organic, true);
  assert.equal(
    formedPlazaInspiration(merge(quarterAround(60, 60), paved), null),
    PLAZA_FORMED_INSPIRATION * ORGANIC_PLAZA_MULT
  );
}

// Field monotonicity: adding anything — a cottage, a fountain, a junction-
// making road — never lowers the field anywhere (principle 6's spirit).
{
  const base = quarterAround(60, 60);
  const before = computeGathering(base, null).field;
  const additions: TileMap[] = [
    stamp("cottage", { x: 70, y: 60 }),
    stamp("fountain", { x: 60, y: 70 }),
    merge(surface("road", 50, 40, 1, 9), surface("road", 46, 44, 9, 1)), // a crossroads
  ];
  for (const add of additions) {
    const after = computeGathering(merge(base, add), null).field;
    for (let i = 0; i < before.length; i += 1) {
      assert.ok(after[i]! >= before[i]! - 1e-6);
    }
  }
  // ...and a formed plaza survives growth elsewhere: every original cell is
  // still plaza ground after a new cottage lands outside it.
  const grown = computeGathering(merge(base, stamp("cottage", { x: 70, y: 60 })), null);
  for (const cell of computeGathering(base, null).plazas[0]!.cells) {
    assert.ok(grown.plazaCells.has(cell));
    assert.equal(grown.plazas[grown.plazaCells.get(cell)!]!.organic, true);
  }
}

// Enclosure, isolated from the field: slide the right cottage out past
// PLAZA_ENCLOSE_REACH and the east lanes leak to open meadow — no plaza —
// even though the block's field still clears GATHER_FORM.
{
  const leaky = merge(
    stamp("cottage", { x: 56, y: 60 }),
    stamp("cottage", { x: 68, y: 60 }), // gap 4 > PLAZA_ENCLOSE_REACH
    stamp("cottage", { x: 60, y: 56 }),
    stamp("cottage", { x: 60, y: 64 }),
    stamp("tavern", { x: 56, y: 68 })
  );
  const g = computeGathering(leaky, null);
  assert.equal(g.plazas.length, 0);
  let sum = 0;
  for (let y = 60; y < 64; y += 1) for (let x = 60; x < 64; x += 1) sum += g.field[y * GRID_SIZE + x]!;
  assert.ok(sum / 16 >= GATHER_FORM);
}

// Water never joins a plaza: with a watery seed, the block over a water cell
// can't qualify however hot the field — the identical layout on a dry map does.
{
  let seed = "";
  let waterKey = "";
  for (let i = 0; i < 100 && !waterKey; i += 1) {
    seed = `gather-water-${i}`;
    for (const key of getWaterCells(seed)) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      // Room for the quarter fixture around the containing block.
      if (x > 10 && x < GRID_SIZE - 14 && y > 10 && y < GRID_SIZE - 14) {
        waterKey = key;
        break;
      }
    }
  }
  assert.ok(waterKey);
  const [wx, wy] = waterKey.split(",").map(Number) as [number, number];
  const quarter = quarterAround(wx - 1, wy - 1);
  // The fixture ignores placement rules (cottages may sit "on" water) — the
  // assertion only needs the field hot around the block containing the water.
  assert.ok(!computeGathering(quarter, seed).plazaCells.has(waterKey));
  assert.ok(computeGathering(quarter, null).plazaCells.has(waterKey));
}

// Determinism: identically constructed maps yield identical plazas.
{
  const a = computeGathering(quarterAround(60, 60), null);
  const b = computeGathering(quarterAround(60, 60), null);
  assert.deepEqual(a.plazas, b.plazas);
}

// GATHER_FORM sits between "a lively quarter" and "a lone cottage" — pin the
// tuning window so weight changes that break the scenarios above fail loudly.
{
  const hot = computeGathering(quarterAround(60, 60), null);
  const blockMean =
    hot.field.slice(0).reduce((sum, _, i) => {
      const x = i % GRID_SIZE;
      const y = Math.floor(i / GRID_SIZE);
      return x >= 60 && x < 64 && y >= 60 && y < 64 ? sum + hot.field[i]! : sum;
    }, 0) / 16;
  assert.ok(blockMean >= GATHER_FORM);
}

console.log("gathering.check: all assertions passed");
