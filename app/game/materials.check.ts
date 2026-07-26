// Self-check for the material stock model (pools, caps, production).
// Run: node --experimental-strip-types app/game/materials.check.ts
import assert from "node:assert";

import { tile } from "./checkHelpers.ts";
import { MATERIAL_COST_SCALE, MATERIAL_STORAGE_BASE, FAVOR_GRANDEUR } from "./constants.ts";
import { ARTWORK_PRESTIGE } from "./artists.ts";
import type { TileMap } from "./grid.ts";
import {
  addProduction,
  commissionMaterialCost,
  EMPTY_POOLS,
  MATERIAL_BY_ARTIST_TYPE,
  MATERIALS,
  materialCaps,
} from "./materials.ts";
import type { Commission, Material } from "./types.ts";

const map = (...tiles: ReturnType<typeof tile>[]): TileMap =>
  Object.fromEntries(tiles.map((t) => [`${t.position.x},${t.position.y}`, t]));

const offer = (extra: Partial<Commission> = {}): Commission => ({
  id: "c1",
  title: "x",
  requester: "The Church",
  artistType: "painter",
  durationMonths: 6,
  florins: 100,
  prestige: 5,
  expiresTick: 20,
  ...extra,
});

// --- Caps ---

// An empty city still has the base yard for every material.
{
  const caps = materialCaps({});
  for (const m of MATERIALS) assert.equal(caps[m], MATERIAL_STORAGE_BASE);
}

// A supplier raises only its own material's ceiling; a warehouse raises all of them.
{
  const withSupplier = materialCaps(map(tile("marble_supplier", 0, 0)));
  assert.ok(withSupplier.marble > MATERIAL_STORAGE_BASE);
  assert.equal(withSupplier.pigment, MATERIAL_STORAGE_BASE);

  const withWarehouse = materialCaps(map(tile("warehouse", 4, 0)));
  for (const m of MATERIALS) assert.ok(withWarehouse[m] > MATERIAL_STORAGE_BASE);

  // The construction suppliers follow the same rule.
  const withYard = materialCaps(map(tile("timber_yard", 0, 0), tile("stone_quarry", 4, 0)));
  assert.ok(withYard.timber > MATERIAL_STORAGE_BASE);
  assert.ok(withYard.stone > MATERIAL_STORAGE_BASE);
  assert.equal(withYard.marble, MATERIAL_STORAGE_BASE);
}

// Storage doesn't need staffing — an unstaffed supplier still holds its stock.
{
  const staffed = materialCaps(map(tile("marble_supplier", 0, 0)));
  const idle = materialCaps(map(tile("marble_supplier", 0, 0, { isActive: false })));
  assert.deepEqual(idle, staffed);
}

// Monotonic: adding any building never lowers a cap (principle 6).
{
  let tiles: TileMap = {};
  let prev = materialCaps(tiles);
  for (const [i, id] of (
    ["marble_supplier", "warehouse", "bronze_foundry", "warehouse", "pigment_trader"] as const
  ).entries()) {
    tiles = { ...tiles, ...map(tile(id, i * 4, 0)) };
    const caps = materialCaps(tiles);
    for (const m of MATERIALS) assert.ok(caps[m] >= prev[m], `${id} lowered ${m}`);
    prev = caps;
  }
}

// --- Production ---

// Production clamps at the cap and never runs a pool backwards.
{
  const caps = { pigment: 10, marble: 10, bronze: 10, timber: 10, stone: 10 };
  const out = addProduction({ pigment: 8, marble: 0, bronze: 0, timber: 0, stone: 0 }, [
    { material: "pigment", amount: 5 },
  ], caps);
  assert.equal(out.pigment, 10);
  assert.equal(out.marble, 0);
}

// Nothing produced → same object identity (the tick's change-tracking convention).
{
  const pools = { ...EMPTY_POOLS };
  assert.equal(addProduction(pools, [], materialCaps({})), pools);
  // Already at the cap: production changes nothing, so identity holds too.
  const full = { pigment: 20, marble: 20, bronze: 20, timber: 20, stone: 20 };
  assert.equal(addProduction(full, [{ material: "pigment", amount: 3 }], full), full);
}

// Two suppliers of the same material both count — more suppliers is never less stock.
{
  const caps = { pigment: 100, marble: 100, bronze: 100, timber: 100, stone: 100 };
  const one = addProduction(EMPTY_POOLS, [{ material: "pigment", amount: 2 }], caps);
  const two = addProduction(
    EMPTY_POOLS,
    [{ material: "pigment", amount: 2 }, { material: "pigment", amount: 2 }],
    caps
  );
  assert.ok(two.pigment > one.pigment);
}

// --- Commission cost ---

// Pre-stockpile offers (no materialCost) are free, so old saves stay assignable.
assert.equal(commissionMaterialCost(offer()), 0);
assert.equal(commissionMaterialCost(offer({ materialCost: 30 })), 30);

// The grandest possible ask stays reachable: max cost (top rank × top grandeur)
// must fit under a cap the player can actually build.
{
  const maxCost =
    MATERIAL_COST_SCALE *
    Math.max(...Object.values(ARTWORK_PRESTIGE)) *
    Math.max(...FAVOR_GRANDEUR);
  const reachable = materialCaps(
    map(tile("marble_supplier", 0, 0), tile("marble_supplier", 4, 0), tile("warehouse", 8, 0))
  );
  assert.ok(
    reachable.marble >= maxCost,
    `grandest ask (${maxCost}) exceeds a 2-supplier + warehouse cap (${reachable.marble})`
  );
}

// Architects stay materially ungated.
assert.equal(MATERIAL_BY_ARTIST_TYPE.architect, undefined);

// Marble and bronze remain separate pools (same artist type, different stock).
{
  const caps = { pigment: 50, marble: 50, bronze: 50, timber: 50, stone: 50 };
  const out = addProduction(EMPTY_POOLS, [{ material: "marble" as Material, amount: 4 }], caps);
  assert.equal(out.marble, 4);
  assert.equal(out.bronze, 0);
}

console.log("materials.check: all assertions passed");
