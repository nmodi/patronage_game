import assert from "node:assert";

import { BASE_POPULATION_CAP } from "./constants.ts";
import type { TileMap } from "./grid.ts";
import { tile } from "./checkHelpers.ts";
import { computeCityMetrics } from "./metrics.ts";

{
  const tiles: TileMap = {
    "0,0": tile("cottage", 0, 0),
    "1,0": tile("cottage", 1, 0, { origin: { x: 0, y: 0 }, isOrigin: false }),
  };
  assert.deepEqual(computeCityMetrics(tiles), {
    housing: 4,
    amenities: BASE_POPULATION_CAP,
  });
}

{
  const tiles: TileMap = {
    "0,0": tile("town_center_plaza", 0, 0),
    "1,0": tile("cottage", 1, 0),
    "0,1": tile("bakery", 0, 1),
  };
  assert.deepEqual(computeCityMetrics(tiles), {
    housing: 5,
    amenities: BASE_POPULATION_CAP + 25,
  });
}

{
  const tiles: TileMap = { "0,0": tile("bakery", 0, 0, { isActive: false }) };
  assert.equal(computeCityMetrics(tiles).amenities, BASE_POPULATION_CAP);
}

console.log("metrics.check: all assertions passed");
