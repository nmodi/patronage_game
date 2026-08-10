// Self-check for the seeded elevation layer (terrace levels, water setback).
// Run: npm test (tsx --test) or node --experimental-strip-types app/game/map/elevation.check.ts
import assert from "node:assert";

import { CELL_SIZE, GRID_SIZE } from "../constants.ts";
import { generateElevation, getElevation, groundHeight, LEVEL_HEIGHT, MAX_LEVEL } from "./elevation.ts";
import { generateWater } from "./water.ts";

const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;
const cellCenter = (g: number) => g * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;

function checkInvariants(seed: string) {
  const e = generateElevation(seed);

  // Determinism.
  const again = generateElevation(seed);
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      assert.equal(again.levelAt(gx, gy), e.levelAt(gx, gy), `${seed}: not deterministic`);
    }
  }

  if (!e.hilly) {
    assert.equal(e.maxLevel, 0);
    assert.equal(e.levelAt(10, 10), 0);
    return;
  }

  const water = generateWater(seed);
  let levelZero = 0;
  let sawMax = 0;
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const level = e.levelAt(gx, gy);
      assert.ok(level >= 0 && level <= MAX_LEVEL, `${seed}: level ${level} out of range`);
      if (level === 0) levelZero += 1;
      if (level > sawMax) sawMax = level;

      // 4-neighbor steps never exceed 1 (roads/walkers ramp one step).
      if (gx + 1 < GRID_SIZE) {
        assert.ok(Math.abs(level - e.levelAt(gx + 1, gy)) <= 1, `${seed}: cliff >1 at ${gx},${gy}`);
      }
      if (gy + 1 < GRID_SIZE) {
        assert.ok(Math.abs(level - e.levelAt(gx, gy + 1)) <= 1, `${seed}: cliff >1 at ${gx},${gy}`);
      }

      // Water cells and their margin stay level 0.
      if (level > 0) {
        const x = cellCenter(gx);
        const z = cellCenter(gy);
        const d = Math.min(water.riverDistance(x, z), -water.seaDistance(x, z));
        assert.ok(d >= 2.5, `${seed}: level ${level} cell ${gx},${gy} only ${d.toFixed(2)} wu from water`);
      }
    }
  }
  assert.equal(sawMax, e.maxLevel, `${seed}: maxLevel doesn't match the grid`);
  // Plains dominate — a city always has room on level 0.
  assert.ok(levelZero >= GRID_SIZE * GRID_SIZE * 0.4, `${seed}: only ${levelZero} level-0 cells`);

  // levelAt clamps out-of-grid coordinates to the rim.
  assert.equal(e.levelAt(-5, 10), e.levelAt(0, 10));
  assert.equal(e.levelAt(GRID_SIZE + 3, 10), e.levelAt(GRID_SIZE - 1, 10));
}

let hillyCount = 0;
for (let i = 0; i < 80; i += 1) {
  const seed = `check-${i.toString(36)}`;
  checkInvariants(seed);
  if (generateElevation(seed).hilly) hillyCount += 1;
}
assert.ok(hillyCount >= 20 && hillyCount <= 70, `hilly on ${hillyCount}/80 seeds — roll drifted`);

// Memoized accessor + null = flat.
assert.equal(getElevation(null).hilly, false);
assert.equal(getElevation("abc"), getElevation("abc"), "getElevation should memoize per seed");

// groundHeight samples the cell under a world point, terraced (not smoothed).
const hillySeed = Array.from({ length: 80 }, (_, i) => `check-${i.toString(36)}`).find(
  (s) => generateElevation(s).hilly
)!;
const e = generateElevation(hillySeed);
for (const [gx, gy] of [[5, 5], [60, 60], [100, 20]] as const) {
  assert.equal(
    groundHeight(e, cellCenter(gx), cellCenter(gy)),
    LEVEL_HEIGHT * e.levelAt(gx, gy)
  );
}
assert.equal(groundHeight(getElevation(null), 3, 3), 0);

console.log("elevation.check: all assertions passed");
