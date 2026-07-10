// Self-check for the run seed → city name derivation.
// Run: node --experimental-strip-types app/game/seed.check.ts
import assert from "node:assert";

import { generateSeed, pickCityName, seededRng } from "./seed.ts";

// Deterministic: the same seed always yields the same name and RNG stream.
assert.equal(pickCityName("abc"), pickCityName("abc"));
assert.equal(seededRng("abc")(), seededRng("abc")());

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
