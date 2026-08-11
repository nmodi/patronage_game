// Self-check for the seeded smooth elevation field (water fade, gentle slopes).
// Run: npm test (tsx --test) or node --experimental-strip-types app/game/map/elevation.check.ts
import assert from "node:assert";

import { CELL_SIZE, GRID_SIZE } from "../constants.ts";
import {
  cellCenter,
  footprintSpread,
  generateElevation,
  getElevation,
  MAX_BUILD_SPREAD,
  MAX_RISE,
} from "./elevation.ts";
import { generateWater } from "./water.ts";

function checkInvariants(seed: string): number {
  const e = generateElevation(seed);

  // Determinism; every seeded map has relief now (only null seed is flat).
  const again = generateElevation(seed);
  assert.equal(e.hilly, true);
  assert.equal(again.heightAt(3.7, -12.1), e.heightAt(3.7, -12.1), `${seed}: not deterministic`);

  const water = generateWater(seed);
  let maxSlope = 0;
  const h = (gx: number, gy: number) => e.heightAt(cellCenter(gx), cellCenter(gy));
  // One height sample per cell, cached — the window scan below rereads them.
  const H = new Float64Array(GRID_SIZE * GRID_SIZE);
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const height = h(gx, gy);
      H[gy * GRID_SIZE + gx] = height;
      assert.ok(height >= 0 && height <= MAX_RISE + 1e-9, `${seed}: height ${height} out of range`);

      // Water margin: flat right at the banks.
      const x = cellCenter(gx);
      const z = cellCenter(gy);
      if (water && Math.min(water.riverDistance(x, z), -water.seaDistance(x, z)) < 1.5) {
        assert.ok(height < 1e-9, `${seed}: ${height.toFixed(3)} high at ${gx},${gy} near water`);
      }

      // Gentle slopes: bounded per-cell gradient (rampable everywhere).
      if (gx + 1 < GRID_SIZE) maxSlope = Math.max(maxSlope, Math.abs(h(gx + 1, gy) - height) / CELL_SIZE);
      if (gy + 1 < GRID_SIZE) maxSlope = Math.max(maxSlope, Math.abs(h(gx, gy + 1) - height) / CELL_SIZE);
    }
  }
  assert.ok(maxSlope <= 0.35, `${seed}: slope ${maxSlope.toFixed(3)}/wu too steep`);

  // Nothing blocks: even the biggest footprint (cathedral, 14×12) stays
  // within the spread gate at EVERY position — elevation is visual texture,
  // never placement difficulty.
  for (let gy = 0; gy + 11 < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx + 13 < GRID_SIZE; gx += 1) {
      let min = Infinity;
      let max = -Infinity;
      for (let dy = 0; dy < 12; dy += 1) {
        for (let dx = 0; dx < 14; dx += 1) {
          const v = H[(gy + dy) * GRID_SIZE + gx + dx];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      assert.ok(
        max - min <= MAX_BUILD_SPREAD,
        `${seed}: cathedral spot at ${gx},${gy} blocked (spread ${(max - min).toFixed(3)})`
      );
    }
  }

  // The field continues smoothly past the grid edge (countryside blend).
  const beyond = e.heightAt(cellCenter(GRID_SIZE) + 5, 0);
  assert.ok(beyond >= 0 && beyond <= MAX_RISE, `${seed}: field undefined beyond the grid`);

  let peak = 0;
  for (const v of H) if (v > peak) peak = v;
  return peak;
}

// Character census by peak in-grid height: plains (ripple ≤ 0.15), rolling
// (local octave ≤ 0.7), sloped (broad swell above that). All three must show
// up across 60 seeds or the roll drifted.
let plains = 0;
let rolling = 0;
let sloped = 0;
for (let i = 0; i < 60; i += 1) {
  const peak = checkInvariants(`check-${i.toString(36)}`);
  if (peak <= 0.15 + 1e-9) plains += 1;
  else if (peak <= 0.7 + 1e-9) rolling += 1;
  else sloped += 1;
}
assert.ok(
  plains >= 10 && rolling >= 5 && sloped >= 5,
  `character census drifted: ${plains} plains / ${rolling} rolling / ${sloped} sloped of 60`
);

// Memoized accessor + null = flat.
assert.equal(getElevation(null).hilly, false);
assert.equal(getElevation("abc"), getElevation("abc"), "getElevation should memoize per seed");

// footprintSpread: 0 on flat maps; equals max−min over the footprint cells.
assert.equal(footprintSpread(getElevation(null), { x: 5, y: 5 }, [{ x: 0, y: 0 }, { x: 3, y: 3 }]), 0);
const hillySeed = Array.from({ length: 60 }, (_, i) => `check-${i.toString(36)}`).find(
  (s) => generateElevation(s).hilly
)!;
const e = generateElevation(hillySeed);
const cellsOf = (n: number) => {
  const cells = [];
  for (let dy = 0; dy < n; dy += 1) for (let dx = 0; dx < n; dx += 1) cells.push({ x: dx, y: dy });
  return cells;
};
const spread = footprintSpread(e, { x: 20, y: 20 }, cellsOf(4));
let min = Infinity;
let max = -Infinity;
for (const c of cellsOf(4)) {
  const v = e.heightAt(cellCenter(20 + c.x), cellCenter(20 + c.y));
  min = Math.min(min, v);
  max = Math.max(max, v);
}
assert.ok(Math.abs(spread - (max - min)) < 1e-12);

console.log("elevation.check: all assertions passed");
