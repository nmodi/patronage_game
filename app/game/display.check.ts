// Self-check for work display: slot rotation, compat guard, host bonus,
// trickle math (inspiration vs church prestige).
// Run: node --experimental-strip-types app/game/display.check.ts
import assert from "node:assert";

import { BUILDING_METADATA_BY_ID, footprintMask, rotatedFootprint } from "./buildings.ts";
import { stamp } from "./checkHelpers.ts";
import {
  canDisplayWork,
  computeDisplaySummary,
  displayBoost,
  plinthSlotAt,
  rotateSlotCell,
  slotAccepts,
} from "./display.ts";
import type { Artwork } from "./types.ts";

function work(overrides: Partial<Artwork>): Artwork {
  return { id: "x", name: "W", artistId: "a", artistType: "sculptor", completedTick: 0, ...overrides };
}

// rotateSlotCell: identity at r0, hand-derived 6×4 cases (cell 1,3).
{
  assert.deepEqual(rotateSlotCell({ x: 1, y: 3 }, { width: 6, depth: 4 }, 0), { x: 1, y: 3 });
  assert.deepEqual(rotateSlotCell({ x: 1, y: 3 }, { width: 6, depth: 4 }, 1), { x: 3, y: 4 });
  assert.deepEqual(rotateSlotCell({ x: 1, y: 3 }, { width: 6, depth: 4 }, 2), { x: 4, y: 0 });
  assert.deepEqual(rotateSlotCell({ x: 1, y: 3 }, { width: 6, depth: 4 }, 3), { x: 0, y: 1 });
}

// Every slot of every def: plinths carry an integer cell that lands inside
// the claimed footprint at all 8 rotations — the rect for quarters, the
// diagonal mask for 4-7 — and no two plinths collide on a cell (plinthSlotAt
// maps clicks back by cell equality). Painting/statue slots carry none.
for (const meta of Object.values(BUILDING_METADATA_BY_ID)) {
  if (!meta.displaySlots) continue;
  for (let r = 0; r < 8; r += 1) {
    const seen = new Set<string>();
    for (const slot of meta.displaySlots) {
      if (slot.kind !== "plinth") {
        assert.ok(!slot.cell, `${meta.id}: ${slot.kind} slot must not carry a cell`);
        continue;
      }
      assert.ok(slot.cell, `${meta.id}: plinth slot needs a cell`);
      const c = rotateSlotCell(slot.cell, meta.footprint, r);
      assert.ok(Number.isInteger(c.x) && Number.isInteger(c.y), `${meta.id} r${r}: non-integer cell`);
      if (r < 4) {
        const rf = rotatedFootprint(meta, r);
        assert.ok(
          c.x >= 0 && c.x < rf.width && c.y >= 0 && c.y < rf.depth,
          `${meta.id} r${r}: cell ${c.x},${c.y} out of footprint`
        );
      } else {
        assert.ok(
          footprintMask(meta, r).cells.some((m) => m.x === c.x && m.y === c.y),
          `${meta.id} r${r}: cell ${c.x},${c.y} not a claimed mask cell`
        );
      }
      const key = `${c.x},${c.y}`;
      assert.ok(!seen.has(key), `${meta.id} r${r}: two plinths collide on ${key}`);
      seen.add(key);
    }
  }
}

// Diagonal hand case: sculpture_display's center plinth stays the mask's
// center cell at every diagonal rotation.
{
  const disp = BUILDING_METADATA_BY_ID["sculpture_display"]!;
  for (const r of [4, 5, 6, 7]) {
    const mask = footprintMask(disp, r);
    assert.deepEqual(rotateSlotCell(disp.displaySlots![0]!.cell!, disp.footprint, r), {
      x: mask.center.x,
      y: mask.center.y,
    });
  }
}

// plinthSlotAt maps a clicked offset back to its slot; painting-only hosts never match.
{
  const plaza = BUILDING_METADATA_BY_ID["plaza"]!;
  assert.equal(plinthSlotAt(plaza.displaySlots!, plaza.footprint, 0, 1, 3), 0);
  assert.equal(plinthSlotAt(plaza.displaySlots!, plaza.footprint, 0, 6, 4), 1);
  assert.equal(plinthSlotAt(plaza.displaySlots!, plaza.footprint, 0, 0, 0), undefined);
  const cath = BUILDING_METADATA_BY_ID["cathedral"]!;
  assert.equal(plinthSlotAt(cath.displaySlots!, cath.footprint, 0, 0, 0), undefined);
}

// slotAccepts matrix.
{
  assert.ok(slotAccepts("painting", "painter"));
  assert.ok(!slotAccepts("statue", "painter"));
  assert.ok(!slotAccepts("plinth", "painter"));
  assert.ok(slotAccepts("statue", "sculptor"));
  assert.ok(slotAccepts("plinth", "sculptor"));
  assert.ok(!slotAccepts("painting", "sculptor"));
  assert.ok(!slotAccepts("painting", "architect"));
}

// displayBoost: +5% per work, capped +25%.
{
  assert.equal(displayBoost(0), 1);
  assert.ok(Math.abs(displayBoost(3) - 1.15) < 1e-9);
  assert.ok(Math.abs(displayBoost(5) - 1.25) < 1e-9);
  assert.ok(Math.abs(displayBoost(8) - 1.25) < 1e-9);
}

// canDisplayWork guard.
{
  const tiles = stamp("plaza", { x: 0, y: 0 });
  const scu = work({ id: "s1" });
  const pai = work({ id: "p1", artistType: "painter" });
  assert.ok(canDisplayWork(scu, "0,0", 0, tiles, [scu, pai])); // happy path
  assert.ok(!canDisplayWork(pai, "0,0", 0, tiles, [scu, pai])); // painter can't take a plinth
  assert.ok(!canDisplayWork(scu, "0,0", 5, tiles, [scu])); // slot index out of range
  assert.ok(!canDisplayWork(scu, "9,9", 0, tiles, [scu])); // no host at key
  const occupied = work({ id: "s1", displayedAt: { key: "0,0", slot: 0 } });
  const scu2 = work({ id: "s2" });
  assert.ok(!canDisplayWork(scu2, "0,0", 0, tiles, [occupied, scu2])); // slot occupied
  assert.ok(!canDisplayWork(occupied, "0,0", 1, tiles, [occupied])); // work already displayed

  const cottage = stamp("cottage", { x: 0, y: 0 });
  assert.ok(!canDisplayWork(scu, "0,0", 0, cottage, [scu])); // host has no display slots
}

// computeDisplaySummary: plaza → inspiration, church → prestige, dangling ignored, default quality.
{
  const tiles = { ...stamp("plaza", { x: 0, y: 0 }), ...stamp("chapel", { x: 20, y: 0 }) };
  const onPlaza = work({ id: "david", prestige: 8, displayedAt: { key: "0,0", slot: 0 } });
  const onChapel = work({ id: "madonna", artistType: "painter", prestige: 10, displayedAt: { key: "20,0", slot: 0 } });
  const dangling = work({ id: "ghost", prestige: 5, displayedAt: { key: "99,99", slot: 0 } });
  const stored = work({ id: "stored", prestige: 4 });
  const legacy = work({ id: "legacy", displayedAt: { key: "0,0", slot: 1 } }); // no prestige → default 2
  const sum = computeDisplaySummary(tiles, [onPlaza, onChapel, dangling, stored, legacy]);
  assert.ok(Math.abs(sum.inspiration - (8 * 0.25 + 2 * 0.25)) < 1e-9); // 2 + 0.5 = 2.5
  assert.ok(Math.abs(sum.prestige - 10 * 0.02) < 1e-9); // 0.2
  assert.equal(sum.counts.get("0,0"), 2);
  assert.equal(sum.counts.get("20,0"), 1);
  assert.ok(!sum.counts.has("99,99"));
}

console.log("display.check: all assertions passed");
