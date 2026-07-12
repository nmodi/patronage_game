import assert from "node:assert";

import { BUILDING_METADATA_BY_ID } from "./buildings.ts";
import { CELL_SIZE, GRID_SIZE } from "./constants.ts";
import { gridToWorld, worldToGrid } from "./grid.ts";

const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;

assert.deepEqual(worldToGrid(-halfGrid, -halfGrid), { x: 0, y: 0 });
assert.deepEqual(worldToGrid(halfGrid - 1e-9, halfGrid - 1e-9), {
  x: GRID_SIZE - 1,
  y: GRID_SIZE - 1,
});
assert.equal(worldToGrid(-halfGrid - 0.001, 0), null);
assert.equal(worldToGrid(halfGrid, 0), null);

const cell = gridToWorld(0, 0);
assert.equal(cell.x, -halfGrid + CELL_SIZE / 2);
assert.equal(cell.z, -halfGrid + CELL_SIZE / 2);
assert.deepEqual(worldToGrid(cell.x, cell.z), { x: 0, y: 0 });

const workshop = BUILDING_METADATA_BY_ID.workshop;
const normal = gridToWorld(0, 0, workshop, 0);
const rotated = gridToWorld(0, 0, workshop, 1);
assert.equal(normal.x - cell.x, ((workshop.footprint.width - 1) * CELL_SIZE) / 2);
assert.equal(normal.z - cell.z, ((workshop.footprint.depth - 1) * CELL_SIZE) / 2);
assert.equal(rotated.x - cell.x, ((workshop.footprint.depth - 1) * CELL_SIZE) / 2);
assert.equal(rotated.z - cell.z, ((workshop.footprint.width - 1) * CELL_SIZE) / 2);

assert.equal(gridToWorld(0, 0, BUILDING_METADATA_BY_ID.path).y, 0.001);
assert.equal(normal.y, workshop.size.height / 2);

console.log("grid.check: all assertions passed");
