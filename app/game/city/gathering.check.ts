// Self-check for the gathering field + freeform plaza formation.
// Run: node --experimental-strip-types app/game/city/gathering.check.ts
import assert from "node:assert";

import { stamp, tile } from "../checkHelpers.ts";
import {
  GATHER_FORM,
  GRID_SIZE,
  ORGANIC_PLAZA_MULT,
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

/** A lively quarter around the open 5×5 organic core at (bx..bx+4, by..by+4):
 * cottage walls on three sides (pinwheel-interlocked, nothing overlaps), the
 * street as the south wall — a campo must be PUBLIC, so its frame includes
 * street frontage — and a tavern beyond it for warmth. Comfortably over
 * GATHER_FORM, fully enclosed, and with no open ground adjacent for fill-out
 * (the region stays exactly 25). */
function quarterAround(bx: number, by: number): TileMap {
  return merge(
    stamp("cottage", { x: bx - 3, y: by - 4 }), // north wall
    stamp("cottage", { x: bx + 1, y: by - 4 }),
    stamp("cottage", { x: bx + 5, y: by - 3 }), // east wall
    stamp("cottage", { x: bx + 5, y: by + 1 }),
    surface("road", bx, by + 5, 5, 1), // south wall: the street it opens onto
    stamp("tavern", { x: bx + 4, y: by + 6 }),
    stamp("cottage", { x: bx - 4, y: by }), // west wall
    stamp("cottage", { x: bx - 4, y: by + 4 })
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

// Roads convert: the same quarter around a 5×5 of road cells forms a plaza
// over the crossing — but never over bridge decks.
{
  const onRoads = computeGathering(merge(quarterAround(60, 60), surface("road", 60, 60, 5, 5)), null);
  assert.equal(onRoads.plazas.length, 1);
  assert.ok(onRoads.plazaCells.has("61,61"));
  const onBridge = computeGathering(merge(quarterAround(60, 60), surface("bridge", 60, 60, 5, 5)), null);
  assert.equal(onBridge.plazas.length, 0);
}

// A market stall in the campo never breaks the core (road-overlay cells are
// plaza-able ground).
{
  const tiles = merge(quarterAround(60, 60), { "61,61": tile("market_stall", 61, 61) });
  assert.ok(computeGathering(tiles, null).plazaCells.has("61,61"));
}

// Plaza furniture counts as paving: a fountain centred in a paved court sits
// INSIDE one plaza (its cells included — no hole, no clipped arms), and a
// stall or plinth dropped onto a lone authored 4×4 never unforms it.
{
  const court = merge(surface("plaza_paving", 40, 40, 8, 8), stamp("fountain", { x: 42, y: 40 }));
  const g = computeGathering(court, null);
  assert.equal(g.plazas.length, 1);
  assert.equal(g.plazas[0]!.cells.length, 64);
  assert.ok(g.plazaCells.has("43,41")); // the fountain's center cell

  for (const furniture of ["market_stall", "plinth"] as const) {
    const tiles = merge(surface("plaza_paving", 40, 40, 4, 4), {
      "41,41": tile(furniture, 41, 41),
    });
    assert.equal(computeGathering(tiles, null).plazas.length, 1, furniture);
  }
}

// Organic status is a field property, not a paving property: paving inside the
// hot court keeps it organic (paving more never demotes a plaza), while the
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

// Grand-tier enclosure + fill-out, isolated from the field: the quarter with
// its east wall missing leaks all five east lanes (past the tier's allowance
// of 2) — no plaza, even though the court still clears GATHER_FORM. A helper cottage
// bounding three east rows (2 open) forms organic, and the plaza fills out
// through the opening — but only to PLAZA_ENCLOSE_REACH steps, and never onto
// a cell past it. Bounding two rows (3 open) stays countryside.
{
  const base = merge(
    stamp("cottage", { x: 57, y: 56 }), // north wall
    stamp("cottage", { x: 61, y: 56 }),
    surface("road", 60, 65, 5, 1), // south wall: street frontage (public access)
    stamp("tavern", { x: 64, y: 66 }),
    stamp("cottage", { x: 56, y: 60 }), // west wall
    stamp("cottage", { x: 56, y: 64 }) // east side open
  );
  const leaky = computeGathering(base, null);
  assert.equal(leaky.plazas.length, 0);
  let sum = 0;
  for (let y = 60; y < 65; y += 1) for (let x = 60; x < 65; x += 1) sum += leaky.field[y * GRID_SIZE + x]!;
  assert.ok(sum / 25 >= GATHER_FORM);

  // Cottage at (65,59) bounds east rows 60..62 at reach 1 → rows 63,64 open.
  const twoOpen = computeGathering(merge(base, stamp("cottage", { x: 65, y: 59 })), null);
  assert.equal(twoOpen.plazas.length, 1);
  assert.equal(twoOpen.plazas[0]!.organic, true);
  assert.ok(twoOpen.plazaCells.has("60,60"));
  assert.ok(twoOpen.plazaCells.has("67,63")); // filled out through the opening (3 steps)
  assert.ok(!twoOpen.plazaCells.has("68,63")); // ...but never past the reach

  // Cottage at (65,58) bounds only rows 60,61 → rows 62..64 open.
  const threeOpen = computeGathering(merge(base, stamp("cottage", { x: 65, y: 58 })), null);
  assert.equal(threeOpen.plazas.length, 0);
}

// Small campo tier: a village green — 4×4 walled flush by cottages on three
// sides with the street as its fourth wall — forms organic with zero
// forgiveness and nothing to fill out, and growth elsewhere never un-forms
// it (building only ever bounds more lanes). The same court walled by
// buildings on ALL four sides is a private yard — no public access, no
// campo, however hot. And with the street wall but the east cottage recessed
// a row, a single lane runs open — one too many for the small tier.
{
  const village = merge(
    stamp("cottage", { x: 56, y: 60 }), // west, flush
    stamp("cottage", { x: 60, y: 56 }), // north, flush
    stamp("cottage", { x: 60, y: 64 }), // south, flush
    surface("road", 64, 60, 1, 4), // east wall: the street (public access)
    stamp("tavern", { x: 56, y: 68 })
  );
  const g = computeGathering(village, null);
  assert.equal(g.plazas.length, 1);
  assert.equal(g.plazas[0]!.organic, true);
  assert.equal(g.plazas[0]!.cells.length, 16); // fully walled: nothing to fill out
  assert.ok(g.plazaCells.has("60,60"));
  const grown = computeGathering(
    merge(village, stamp("cottage", { x: 70, y: 60 }), stamp("townhouse", { x: 68, y: 68 })),
    null
  );
  assert.ok(grown.plazaCells.has("60,60")); // the village campo survives the city

  const yard = merge(
    stamp("cottage", { x: 56, y: 60 }), // west, flush
    stamp("cottage", { x: 64, y: 60 }), // east, flush — walls on all four sides
    stamp("cottage", { x: 60, y: 56 }), // north, flush
    stamp("cottage", { x: 60, y: 64 }), // south, flush
    stamp("tavern", { x: 56, y: 68 })
  );
  const p = computeGathering(yard, null);
  assert.equal(p.plazas.length, 0); // private yard: enclosed but inaccessible
  let yardSum = 0;
  for (let y = 60; y < 64; y += 1)
    for (let x = 60; x < 64; x += 1) yardSum += p.field[y * GRID_SIZE + x]!;
  assert.ok(yardSum / 16 >= GATHER_FORM);

  const leaky = merge(
    stamp("cottage", { x: 56, y: 60 }), // west, flush
    stamp("cottage", { x: 60, y: 56 }), // north, flush
    surface("road", 60, 64, 4, 1), // south wall: the street (public access)
    stamp("cottage", { x: 64, y: 61 }), // east, recessed: row 60's lane runs open
    stamp("tavern", { x: 56, y: 68 })
  );
  const l = computeGathering(leaky, null);
  assert.equal(l.plazas.length, 0);
  let sum = 0;
  for (let y = 60; y < 64; y += 1) for (let x = 60; x < 64; x += 1) sum += l.field[y * GRID_SIZE + x]!;
  assert.ok(sum / 16 >= GATHER_FORM);
}

// The map edge frames nothing: a hot corner nook (2..5, 2..5) with a street
// south (public access), a townhouse east, and a tavern beyond leaves the
// north and west lanes running off the world — no campo, however hot.
{
  const nook = merge(
    surface("road", 2, 6, 4, 1), // south wall: the street
    stamp("townhouse", { x: 6, y: 2 }), // east wall
    stamp("tavern", { x: 6, y: 6 }) // diagonal, for warmth
  );
  const g = computeGathering(nook, null);
  assert.equal(g.plazas.length, 0);
  let sum = 0;
  for (let y = 2; y < 6; y += 1) for (let x = 2; x < 6; x += 1) sum += g.field[y * GRID_SIZE + x]!;
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
