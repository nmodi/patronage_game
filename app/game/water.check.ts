// Self-check for the seeded water layer (river course, coast, blocking).
// Run: node --experimental-strip-types app/game/water.check.ts
import assert from "node:assert";

import { generateWater, getWater, getWaterCells, type WaterBody } from "./water.ts";

const GRID_SIZE = 80;
const CELL_SIZE = 0.5;
const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;

const cellCenter = (g: number) => g * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;

// 4-connected flood fill over land (non-water) cells from a start cell.
function landComponent(water: ReadonlySet<string>, start: [number, number]): Set<string> {
  const seen = new Set<string>([`${start[0]},${start[1]}`]);
  const queue: [number, number][] = [start];
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
      if (seen.has(key) || water.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

// Land probes on both banks at an inland flow slice (grid coords).
function bankProbes(w: WaterBody): [[number, number], [number, number]] {
  // For coastal runs probe at the far-from-sea end; either end works inland.
  const coastal = w.archetype === "coastal";
  const highEnd = w.coastEdge === "east" || w.coastEdge === "north";
  const flowIndex = coastal && highEnd ? 0 : GRID_SIZE - 1;
  const t = cellCenter(flowIndex);
  const center = w.riverCenterAt(t);
  const toIndex = (world: number) => Math.round((world + HALF_GRID - CELL_SIZE / 2) / CELL_SIZE);
  const low = Math.max(0, toIndex(center - w.riverWidthAt(t) / 2 - 2));
  const high = Math.min(GRID_SIZE - 1, toIndex(center + w.riverWidthAt(t) / 2 + 2));
  return w.riverAxis === "x"
    ? [[flowIndex, low], [flowIndex, high]]
    : [[low, flowIndex], [high, flowIndex]];
}

function checkInvariants(seed: string) {
  const w = generateWater(seed);

  // Determinism.
  const again = generateWater(seed);
  assert.deepEqual([...again.cells].sort(), [...w.cells].sort(), `${seed}: not deterministic`);
  assert.equal(again.archetype, w.archetype);

  if (w.archetype === "dry") {
    assert.equal(w.cells.size, 0, `${seed}: dry map has water cells`);
    assert.equal(w.riverDistance(0, 0), Infinity);
    assert.equal(w.seaDistance(0, 0), -Infinity);
    assert.equal(w.coastEdge, undefined);
    return;
  }

  if (w.archetype === "scenic-river" || w.archetype === "scenic-coast") {
    // Scenery only: no buildable cell is water, and the water keeps a real
    // margin from the grid so not even a bank ribbon reaches a cell.
    assert.equal(w.cells.size, 0, `${seed}: scenic water touches the grid`);
    let minRiver = Infinity;
    let maxSea = -Infinity;
    for (let gy = 0; gy < GRID_SIZE; gy += 1) {
      for (let gx = 0; gx < GRID_SIZE; gx += 1) {
        const x = cellCenter(gx);
        const z = cellCenter(gy);
        minRiver = Math.min(minRiver, w.riverDistance(x, z));
        maxSea = Math.max(maxSea, w.seaDistance(x, z));
      }
    }
    assert.ok(minRiver > 0.5, `${seed}: scenic river only ${minRiver.toFixed(2)} wu from a cell`);
    assert.ok(maxSea < -0.5, `${seed}: scenic sea only ${(-maxSea).toFixed(2)} wu from a cell`);
    assert.equal(w.coastEdge != null, w.archetype === "scenic-coast", `${seed}: coastEdge mismatch`);
    return;
  }

  // All cells in-bounds and consistent with the distance fields.
  for (const key of w.cells) {
    const [gx, gy] = key.split(",").map(Number);
    assert.ok(gx! >= 0 && gx! < GRID_SIZE && gy! >= 0 && gy! < GRID_SIZE, `${seed}: ${key} out of bounds`);
    const x = cellCenter(gx!);
    const z = cellCenter(gy!);
    assert.ok(
      w.riverDistance(x, z) < 0 || w.seaDistance(x, z) > 0,
      `${seed}: ${key} marked water but both distance fields say land`
    );
  }

  // River cells keep the edge margin on the cross axis (the sea may touch its
  // own edge, so filter to river-only cells).
  for (const key of w.cells) {
    const [gx, gy] = key.split(",").map(Number);
    const x = cellCenter(gx!);
    const z = cellCenter(gy!);
    if (!(w.riverDistance(x, z) < 0)) continue;
    const crossIndex = w.riverAxis === "x" ? gy! : gx!;
    assert.ok(
      crossIndex >= 9 && crossIndex <= GRID_SIZE - 10,
      `${seed}: river cell ${key} hugs a parallel grid edge`
    );
  }

  // The river truly severs the grid: the two banks are separate land components,
  // so no road can sneak around the water without a bridge.
  const [probeA, probeB] = bankProbes(w);
  assert.ok(!w.cells.has(`${probeA[0]},${probeA[1]}`), `${seed}: bank probe A is wet`);
  assert.ok(!w.cells.has(`${probeB[0]},${probeB[1]}`), `${seed}: bank probe B is wet`);
  const component = landComponent(w.cells, probeA);
  assert.ok(!component.has(`${probeB[0]},${probeB[1]}`), `${seed}: banks are connected by land`);

  // Enough dry land for a real city (plan: ≥ ~55×80 cells' worth).
  const land = GRID_SIZE * GRID_SIZE - w.cells.size;
  assert.ok(land >= 55 * GRID_SIZE, `${seed}: only ${land} land cells`);

  // Every flow slice holds water ≥ 2 cells wide (no one-cell trickle).
  for (let i = 0; i < GRID_SIZE; i += 1) {
    let best = 0;
    let run = 0;
    for (let j = 0; j < GRID_SIZE; j += 1) {
      const key = w.riverAxis === "x" ? `${i},${j}` : `${j},${i}`;
      run = w.cells.has(key) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    assert.ok(best >= 2, `${seed}: flow slice ${i} has max water run ${best}`);
  }

  if (w.archetype === "coastal") {
    assert.ok(w.coastEdge, `${seed}: coastal without coastEdge`);
    // The river reaches the sea: all water is one connected body.
    const someWater = [...w.cells][0]!.split(",").map(Number) as [number, number];
    const seen = new Set<string>([`${someWater[0]},${someWater[1]}`]);
    const queue: [number, number][] = [someWater];
    while (queue.length > 0) {
      const [x, y] = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const key = `${x + dx},${y + dy}`;
        if (seen.has(key) || !w.cells.has(key)) continue;
        seen.add(key);
        queue.push([x + dx, y + dy]);
      }
    }
    assert.equal(seen.size, w.cells.size, `${seed}: water is not one connected body`);
  } else {
    assert.equal(w.coastEdge, undefined);
    assert.equal(w.seaDistance(0, 0), -Infinity);
  }
}

// A spread of seeds exercises every archetype, all axes/signs, and the clamps.
const archetypes = new Set<string>();
for (let i = 0; i < 200; i += 1) {
  const seed = `check-${i.toString(36)}`;
  checkInvariants(seed);
  archetypes.add(generateWater(seed).archetype);
}
assert.deepEqual(
  [...archetypes].sort(),
  ["coastal", "dry", "inland", "scenic-coast", "scenic-river"],
  "all five archetypes should occur"
);

// Memoized accessors.
assert.equal(getWater(null), null);
assert.equal(getWaterCells(null).size, 0);
assert.equal(getWater("abc"), getWater("abc"), "getWater should memoize per seed");
assert.equal(getWaterCells("abc"), getWater("abc")!.cells);

console.log("water.check: all assertions passed");
