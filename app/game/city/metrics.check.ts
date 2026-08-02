import assert from "node:assert";

import { BASE_POPULATION_CAP } from "../constants.ts";
import type { TileMap } from "../grid.ts";
import { tile } from "../checkHelpers.ts";
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

// The stall's amenities scale with foot traffic when population is passed
// (bustle 1 at pop 64, catchment 1 from 24 housing beside the plaza, all in
// walking reach) — and stay at base when it's omitted (traffic muted).
{
  const tiles: TileMap = {
    "0,0": tile("town_center_plaza", 0, 0),
    "1,0": tile("market_stall", 1, 0),
    "0,1": tile("townhouse", 0, 1),
    "-1,0": tile("townhouse", -1, 0),
    "0,-1": tile("townhouse", 0, -1),
  };
  // townhouses at strength 1: housing 3 * round(8*1.25) = 30
  assert.deepEqual(computeCityMetrics(tiles, undefined, undefined, 64), {
    housing: 30,
    amenities: BASE_POPULATION_CAP + 10, // stall 5 * (1 + 1.0*1*1*1)
  });
  assert.equal(computeCityMetrics(tiles).amenities, BASE_POPULATION_CAP + 5);
}

console.log("metrics.check: all assertions passed");
