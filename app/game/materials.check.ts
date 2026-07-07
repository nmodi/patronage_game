// Self-check for material supply allocation.
// Run: node --experimental-strip-types app/game/materials.check.ts
import assert from "node:assert";

import {
  blockedReason,
  computeSupply,
  MATERIAL_BY_ARTIST_TYPE,
  type WorkingWorkshop,
} from "./materials.ts";

const pigment = (capacity: number) => ({ artistType: "painter" as const, capacity });
const w = (
  key: string,
  builtTick: number,
  type: WorkingWorkshop["type"] = "painter"
): WorkingWorkshop => ({ key, type, builtTick });

// Capacity aggregates across suppliers of the same material.
{
  const out = computeSupply([pigment(2), pigment(1)], []);
  assert.equal(out.painter!.capacity, 3);
  assert.equal(out.painter!.inUse, 0);
}

// Demand over capacity: oldest workshops (builtTick) keep their slots.
{
  const out = computeSupply([pigment(2)], [w("9,9", 30), w("1,1", 10), w("5,5", 20)]);
  assert.equal(out.painter!.inUse, 2);
  assert.ok(out.painter!.allowed.has("1,1"));
  assert.ok(out.painter!.allowed.has("5,5"));
  assert.ok(!out.painter!.allowed.has("9,9"));
}

// builtTick tie → key order decides.
{
  const out = computeSupply([pigment(1)], [w("9,9", 5), w("1,1", 5)]);
  assert.ok(out.painter!.allowed.has("1,1"));
  assert.ok(!out.painter!.allowed.has("9,9"));
}

// No suppliers: gated types still get an entry, nothing allowed.
{
  const out = computeSupply([], [w("1,1", 0)]);
  assert.equal(out.painter!.capacity, 0);
  assert.equal(out.painter!.inUse, 0);
  assert.equal(out.painter!.allowed.size, 0);
  assert.equal(out.sculptor!.capacity, 0);
}

// Ungated types are absent from the result and the material map.
{
  const out = computeSupply([], []);
  assert.equal(out.architect, undefined);
  assert.equal(MATERIAL_BY_ARTIST_TYPE.architect, undefined);
}

// Materials of different types don't cross-allocate.
{
  const out = computeSupply([pigment(1)], [w("1,1", 0, "sculptor")]);
  assert.equal(out.painter!.inUse, 0);
  assert.equal(out.sculptor!.inUse, 0);
}

// Blocked-reason strings match the design doc's tooltip examples.
assert.equal(
  blockedReason("painter", { capacity: 0, inUse: 0, allowed: new Set() }),
  "No pigment supplier"
);
assert.equal(
  blockedReason("painter", { capacity: 3, inUse: 3, allowed: new Set() }),
  "Pigment Trader at capacity"
);
assert.equal(
  blockedReason("sculptor", { capacity: 2, inUse: 2, allowed: new Set() }),
  "Marble Supplier at capacity"
);
assert.equal(blockedReason("architect", undefined), null);

console.log("materials.check: all assertions passed");
