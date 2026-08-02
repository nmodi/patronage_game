// Self-check for the foot-traffic model (bustle curve + housing catchment).
// Run: node --experimental-strip-types app/game/traffic.check.ts
import assert from "node:assert";

import { BUILDING_METADATA_BY_ID } from "../buildings.ts";
import { type ConnectivityTile } from "./connectivity.ts";
import {
  bustle,
  CATCHMENT_FULL,
  CATCHMENT_REACH,
  computeCatchment,
  trafficFactor,
} from "./traffic.ts";

// Lay out cells for a building: every footprint cell points at the origin.
function put(
  tiles: Record<string, ConnectivityTile>,
  type: string,
  buildingId: string,
  x: number,
  y: number,
  w = 1,
  d = 1
) {
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      tiles[`${x + dx},${y + dy}`] = { type, buildingId, origin: { x, y } };
    }
  }
}

function road(tiles: Record<string, ConnectivityTile>, x0: number, x1: number, y: number) {
  for (let x = x0; x <= x1; x++) put(tiles, "road", "road", x, y);
}

const stallMeta = BUILDING_METADATA_BY_ID["market_stall"];

// Bustle rides the crowd curve: 1:1 up to 20 figures, sublinear beyond,
// saturating at BUSTLE_FULL (60 figures ⇔ pop ≈ 64).
{
  assert.equal(bustle(0), 0);
  assert.equal(bustle(15), 0.25); // 15/60 — the 1:1 regime
  assert.equal(bustle(23), 0.5); // curve 20 + round(6·√3) = 30
  assert.equal(bustle(64), 1); // curve 20 + round(6·√44) = 60
  assert.equal(bustle(1000), 1); // capped
  let prev = 0;
  for (let pop = 0; pop <= 300; pop++) {
    const b = bustle(pop);
    assert.ok(b >= prev && b <= 1, `bustle monotonic 0..1, broke at pop ${pop}`);
    prev = b;
  }
}

// Catchment: houses adjacent to reached road cells count, deduped by origin —
// a two-cell cottage touching the road twice is still one cottage.
{
  const tiles: Record<string, ConnectivityTile> = {};
  road(tiles, 0, 10, 0);
  put(tiles, "service", "market_stall", 5, 0); // overwrites the road cell
  put(tiles, "residential", "cottage", 3, 1, 2, 1); // both cells touch the road
  assert.equal(computeCatchment(tiles).get("5,0"), 4 / CATCHMENT_FULL);
  put(tiles, "residential", "cottage", 7, 1, 2, 1);
  assert.equal(computeCatchment({ ...tiles }).get("5,0"), 8 / CATCHMENT_FULL);
}

// Reach boundary: housing beside the road cell CATCHMENT_REACH steps out
// counts; one step further doesn't.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "service", "market_stall", 0, 0);
  road(tiles, 1, CATCHMENT_REACH + 2, 0);
  put(tiles, "residential", "cottage", CATCHMENT_REACH, 1); // beside road d=REACH
  assert.equal(computeCatchment(tiles).get("0,0"), 4 / CATCHMENT_FULL);

  const beyond: Record<string, ConnectivityTile> = {};
  put(beyond, "service", "market_stall", 0, 0);
  road(beyond, 1, CATCHMENT_REACH + 2, 0);
  put(beyond, "residential", "cottage", CATCHMENT_REACH + 1, 1); // beside road d=REACH+1
  assert.equal(computeCatchment(beyond).get("0,0"), 0);
}

// Monotonic in roads (principle 6): a new branch reaching an extra house only
// raises catchment; unrelated far-off roads change nothing.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "service", "market_stall", 0, 0);
  road(tiles, 1, 4, 0);
  put(tiles, "residential", "cottage", 1, 1); // on the run
  const before = computeCatchment(tiles).get("0,0")!;

  const branched = { ...tiles };
  for (let y = 1; y <= 3; y++) put(branched, "road", "road", 4, y); // branch south
  put(branched, "residential", "cottage", 5, 3); // reachable only via the branch
  const after = computeCatchment(branched).get("0,0")!;
  assert.ok(after > before, "reaching a new house must raise catchment");

  const farRoads = { ...tiles };
  road(farRoads, 60, 70, 60);
  assert.equal(computeCatchment(farRoads).get("0,0"), before);
}

// Monotonic in houses: adding a house never decreases any stall's catchment.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "service", "market_stall", 0, 0);
  road(tiles, 1, 6, 0);
  put(tiles, "residential", "townhouse", 2, 1, 2, 1);
  const before = computeCatchment(tiles).get("0,0")!;
  const withMore = { ...tiles };
  put(withMore, "residential", "townhouse", 4, 1, 2, 1);
  assert.ok(computeCatchment(withMore).get("0,0")! >= before);
}

// Plaza cells conduct at road cost: housing across the plaza is in reach.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "service", "market_stall", 0, 0);
  put(tiles, "city", "town_center_plaza", 1, 0, 3, 3);
  put(tiles, "residential", "townhouse", 4, 1); // touches the plaza's far side
  assert.equal(computeCatchment(tiles).get("0,0"), 8 / CATCHMENT_FULL);
}

// Saturation: CATCHMENT_FULL housing in reach = exactly 1, never above.
{
  const tiles: Record<string, ConnectivityTile> = {};
  road(tiles, 0, 13, 0);
  put(tiles, "service", "market_stall", 6, 0); // overwrites the road cell
  for (let i = 0; i < 7; i++) put(tiles, "residential", "cottage", i * 2, 1, 2, 1); // 28 housing
  assert.equal(computeCatchment(tiles).get("6,0"), 1);
}

// trafficFactor: unflagged buildings are untouched (factor 1); flagged ones
// hit the base-rate floor at zero population or with nothing in reach.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "service", "market_stall", 0, 0);
  road(tiles, 1, 3, 0);
  put(tiles, "residential", "cottage", 1, 1);
  assert.equal(trafficFactor(BUILDING_METADATA_BY_ID["cottage"], "1,1", tiles, 500), 1);
  assert.equal(trafficFactor(undefined, "0,0", tiles, 500), 1);
  assert.equal(trafficFactor(stallMeta, "0,0", tiles, 0), 0); // empty city
  const lonely: Record<string, ConnectivityTile> = {};
  put(lonely, "service", "market_stall", 0, 0);
  assert.equal(trafficFactor(stallMeta, "0,0", lonely, 500), 0); // no homes in reach
}

// Memoized by tiles identity; structurally equal maps agree on values.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "service", "market_stall", 0, 0);
  road(tiles, 1, 3, 0);
  put(tiles, "residential", "cottage", 2, 1);
  assert.ok(computeCatchment(tiles) === computeCatchment(tiles));
  assert.equal(computeCatchment({ ...tiles }).get("0,0"), computeCatchment(tiles).get("0,0"));
}

console.log("traffic.check: all assertions passed");
