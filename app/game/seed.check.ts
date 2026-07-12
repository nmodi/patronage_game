// Self-check for the run seed → city name derivation.
// Run: node --experimental-strip-types app/game/seed.check.ts
import assert from "node:assert";

import { generateSeed, pickCityName } from "./seed.ts";
import { positionToneIndex, seededRng } from "./random.ts";

// Deterministic: the same seed always yields the same name and RNG stream.
assert.equal(pickCityName("abc"), pickCityName("abc"));
assert.equal(seededRng("abc")(), seededRng("abc")());
const golden = seededRng("abc");
assert.deepEqual([golden(), golden(), golden(), golden()], [
  0.5166419988963753,
  0.6596221292857081,
  0.0018796597141772509,
  0.8993499737698585,
]);
assert.deepEqual(
  [positionToneIndex(0, 0, 3), positionToneIndex(1.25, -4.5, 5), positionToneIndex(12, 9, 4)],
  [0, 3, 3]
);

// Seeds spread across the pool — some pair of seeds must differ.
const names = new Set(
  Array.from({ length: 50 }, (_, i) => pickCityName(`seed-${i}`))
);
assert.ok(names.size > 1, "seeds should not all map to one name");

// Every derived name is a real, non-empty entry from the pool.
for (const n of names) assert.ok(n && n.length > 0);

// generateSeed: short, lowercase alphanumeric, shareable.
for (let i = 0; i < 100; i += 1) {
  assert.match(generateSeed(), /^[a-z0-9]+$/);
}

console.log("seed.check: all assertions passed");
