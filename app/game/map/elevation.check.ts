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

function checkInvariants(seed: string) {
  const e = generateElevation(seed);

  // Determinism.
  const again = generateElevation(seed);
  assert.equal(again.hilly, e.hilly);
  assert.equal(again.heightAt(3.7, -12.1), e.heightAt(3.7, -12.1), `${seed}: not deterministic`);

  if (!e.hilly) {
    assert.equal(e.heightAt(5, 5), 0);
    return;
  }

  const water = generateWater(seed);
  let maxSlope = 0;
  let buildableWindows = 0;
  let windows = 0;
  const h = (gx: number, gy: number) => e.heightAt(cellCenter(gx), cellCenter(gy));
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const height = h(gx, gy);
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

      // Buildable coverage: 4×4-cell (cottage) windows within the spread gate.
      if (gx % 4 === 0 && gy % 4 === 0 && gx + 3 < GRID_SIZE && gy + 3 < GRID_SIZE) {
        windows += 1;
        let min = Infinity;
        let max = -Infinity;
        for (let dy = 0; dy < 4; dy += 1) {
          for (let dx = 0; dx < 4; dx += 1) {
            const v = h(gx + dx, gy + dy);
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        if (max - min <= MAX_BUILD_SPREAD) buildableWindows += 1;
      }
    }
  }
  assert.ok(maxSlope <= 0.35, `${seed}: slope ${maxSlope.toFixed(3)}/wu too steep`);
  assert.ok(
    buildableWindows >= windows * 0.6,
    `${seed}: only ${buildableWindows}/${windows} cottage windows are buildable`
  );

  // The field continues smoothly past the grid edge (countryside blend).
  const beyond = e.heightAt(cellCenter(GRID_SIZE) + 5, 0);
  assert.ok(beyond >= 0 && beyond <= MAX_RISE, `${seed}: field undefined beyond the grid`);
}

let hillyCount = 0;
for (let i = 0; i < 60; i += 1) {
  const seed = `check-${i.toString(36)}`;
  checkInvariants(seed);
  if (generateElevation(seed).hilly) hillyCount += 1;
}
assert.ok(hillyCount >= 15 && hillyCount <= 52, `hilly on ${hillyCount}/60 seeds — roll drifted`);

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
