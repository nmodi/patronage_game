// Self-check for freeform-road rasterization. The critical invariant is that
// every segment's cell set is 8-connected — connectivity.ts / the citizen walk
// depend on it. Run: node --experimental-strip-types app/game/roadRaster.check.ts
import assert from "node:assert";

import { CELL_SIZE, GRID_SIZE } from "./constants.ts";
import { deriveRoadCells, deriveSimTiles, rasterizeSegment } from "./roadRaster.ts";
import type { RoadSegment } from "./roadSegment.ts";
import type { TileMap } from "./grid.ts";

const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;
// World point at the center of cell (gx, gy).
const cx = (g: number) => g * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;

const seg = (
  ax: number,
  az: number,
  bx: number,
  bz: number,
  width = CELL_SIZE,
  buildingId = "path"
): RoadSegment => ({ a: { x: ax, z: az }, b: { x: bx, z: bz }, width, buildingId: buildingId as never });

const keySet = (cells: { x: number; y: number }[]) => new Set(cells.map((c) => `${c.x},${c.y}`));

// Assert a cell set is 8-connected (single component under king moves).
function assert8Connected(cells: { x: number; y: number }[], label: string) {
  assert.ok(cells.length > 0, `${label}: empty`);
  const set = keySet(cells);
  const seen = new Set<string>();
  const stack = [`${cells[0]!.x},${cells[0]!.y}`];
  seen.add(stack[0]!);
  while (stack.length) {
    const [x, y] = stack.pop()!.split(",").map(Number);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nk = `${x! + dx},${y! + dy}`;
        if (set.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
  }
  assert.equal(seen.size, set.size, `${label}: not 8-connected (${seen.size}/${set.size})`);
}

// Horizontal, vertical, 45°, and a shallow arbitrary angle — all 8-connected,
// endpoints included, deduped.
{
  const cases: [string, RoadSegment][] = [
    ["horizontal", seg(cx(10), cx(10), cx(30), cx(10))],
    ["vertical", seg(cx(10), cx(10), cx(10), cx(28))],
    ["diagonal-45", seg(cx(10), cx(10), cx(25), cx(25))],
    ["shallow", seg(cx(5), cx(5), cx(40), cx(12))],
    ["steep", seg(cx(5), cx(5), cx(12), cx(45))],
    ["arbitrary", seg(cx(8), cx(40), cx(37), cx(9))],
  ];
  for (const [label, s] of cases) {
    const cells = rasterizeSegment(s);
    assert8Connected(cells, label);
    assert.equal(new Set(cells.map((c) => `${c.x},${c.y}`)).size, cells.length, `${label}: dup cells`);
    // Endpoints' containing cells are present.
    const has = keySet(cells);
    for (const p of [s.a, s.b]) {
      const gx = Math.floor((p.x + HALF_GRID) / CELL_SIZE);
      const gy = Math.floor((p.z + HALF_GRID) / CELL_SIZE);
      assert.ok(has.has(`${gx},${gy}`), `${label}: endpoint cell missing`);
    }
  }
}

// Wider roads cover more cells than narrow ones over the same span.
{
  const narrow = rasterizeSegment(seg(cx(10), cx(10), cx(30), cx(10), CELL_SIZE)); // 1-wide
  const wide = rasterizeSegment(seg(cx(10), cx(10), cx(30), cx(10), CELL_SIZE * 3)); // 3-wide
  assert.ok(wide.length > narrow.length, "wide road should cover more cells");
  assert8Connected(wide, "wide");
}

// Bounds clamp: a segment running off the grid emits only in-bounds cells.
{
  const cells = rasterizeSegment(seg(cx(GRID_SIZE - 2), cx(GRID_SIZE - 2), cx(GRID_SIZE + 20), cx(GRID_SIZE + 20)));
  for (const c of cells) {
    assert.ok(c.x >= 0 && c.x < GRID_SIZE && c.y >= 0 && c.y < GRID_SIZE, "cell out of bounds");
  }
}

// deriveRoadCells tags derived road tiles.
{
  const cells = deriveRoadCells([seg(cx(10), cx(10), cx(20), cx(10))]);
  const tile = Object.values(cells)[0]!;
  assert.equal(tile.type, "road");
  assert.equal(tile.derived, true);
  assert.equal(tile.rotation, undefined);
}

// deriveSimTiles: empty roads returns the SAME tiles object (identity preserved).
{
  const tiles: TileMap = {};
  assert.equal(deriveSimTiles(tiles, []), tiles);
}

// deriveSimTiles: canonical tile wins its cell over a derived road cell.
{
  const key = `${10},${10}`;
  const tiles: TileMap = {
    [key]: {
      type: "city",
      buildingId: "cottage" as never,
      position: { x: 10, y: 10 },
      origin: { x: 10, y: 10 },
      isOrigin: true,
      isActive: true,
      workers: 0,
      builtTick: 0,
    },
  };
  const roads = [seg(cx(10), cx(10), cx(20), cx(10))];
  const sim = deriveSimTiles(tiles, roads);
  assert.equal(sim[key]!.type, "city", "canonical building must win its cell");
  assert.ok(sim[`${20},${10}`], "a road-only cell must appear");
  // Memoized: same inputs → same object.
  assert.equal(deriveSimTiles(tiles, roads), sim);
}

console.log("roadRaster.check: all assertions passed");
