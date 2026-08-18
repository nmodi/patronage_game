// Self-check for plaza connectivity (main-plaza falloff + secondary refresh).
// Run: node --experimental-strip-types app/game/connectivity.check.ts
import assert from "node:assert";

import {
  computePlazaConnectivity,
  PLAZA_REACH,
  type ConnectivityTile,
} from "./connectivity.ts";

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

// Touching the main plaza directly = full strength.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  put(tiles, "artist", "workshop", 2, 0, 2, 2);
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("2,0"), 1);
  // network pieces are never recipients
  assert.ok(!out.has("0,0"));
}

// Strength falls off linearly with road distance from the main plaza.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 2, 6, 0); // roads at distance 1..5
  put(tiles, "materials", "market", 7, 0, 2, 2); // touches road d=5
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("7,0"), 1 - 5 / PLAZA_REACH);
}

// Beyond PLAZA_REACH the bonus is gone (absent, not 0).
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 2, 2 + PLAZA_REACH, 0);
  put(tiles, "materials", "market", 3 + PLAZA_REACH, 0, 2, 2); // touches road d=PLAZA_REACH+1
  const out = computePlazaConnectivity(tiles);
  assert.ok(!out.has(`${3 + PLAZA_REACH},0`));
}

// A secondary plaza on the network refreshes strength to full past it.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 2, 9, 0); // 8 roads, d=1..8
  put(tiles, "city", "plaza", 10, 0, 2, 2); // reached at d→0
  put(tiles, "artist", "workshop", 12, 0, 2, 2); // touches secondary plaza
  road(tiles, 10, 12, 2); // roads south of the plaza: (11,2) touches plaza cell (11,1) → d=1
  put(tiles, "materials", "market", 13, 2, 2, 2); // touches road (12,2), d=2
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("12,0"), 1); // refreshed to full at the mini-hub
  // road (12,2) reaches plaza cell (11,1) diagonally now → d=1, not 2
  assert.equal(out.get("13,2"), 1 - 1 / PLAZA_REACH);
}

// A bell tower on the network refreshes like a secondary plaza (isHub-derived).
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 2, 9, 0); // 8 roads, d=1..8
  put(tiles, "decoration", "bell_tower", 10, 0, 3, 3); // reached at d→0
  put(tiles, "artist", "workshop", 13, 0, 2, 2); // touches the tower
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("13,0"), 1); // refreshed to full at the campanile
  assert.ok(!out.has("10,0")); // hubs are network, never recipients
}

// A thin diagonal staircase conducts the bonus, one step per cell.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  put(tiles, "road", "road", 2, 2); // diagonal from plaza corner (1,1): d=1
  put(tiles, "road", "road", 3, 3); // d=2
  put(tiles, "road", "road", 4, 4); // d=3
  put(tiles, "materials", "market", 2, 4, 2, 2); // cell (3,4) orthogonal to road (3,3)
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("2,4"), 1 - 2 / PLAZA_REACH);
}

// Past PLAZA_REACH a diagonal chain fades out like a straight one.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  for (let i = 2; i <= 2 + PLAZA_REACH; i += 1) put(tiles, "road", "road", i, i); // d=1..PLAZA_REACH+1
  const end = 2 + PLAZA_REACH;
  put(tiles, "residential", "cottage", end, end + 1); // orthogonal to the last stair cell
  const out = computePlazaConnectivity(tiles);
  assert.ok(!out.has(`${end},${end + 1}`));
}

// A market stall replacing a mid-run road cell conducts the network at road
// cost (placesOnRoads-derived), so a 1-wide path is never severed — and the
// stall itself, being a non-road service, still receives strength.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 2, 3, 0); // d=1,2
  put(tiles, "service", "market_stall", 4, 0); // conducts at d=3
  road(tiles, 5, 6, 0); // d=4,5
  put(tiles, "materials", "market", 7, 0, 2, 2); // touches road d=5
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("7,0"), 1 - 5 / PLAZA_REACH); // downstream unharmed
  assert.equal(out.get("4,0"), 1 - 2 / PLAZA_REACH); // stall receives via road (3,0)
}

// A stall on a dead-end road still receives strength.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  put(tiles, "road", "road", 2, 0); // d=1
  put(tiles, "service", "market_stall", 3, 0); // road ends here
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("3,0"), 1 - 1 / PLAZA_REACH);
}

// An isolated secondary plaza radiates nothing — only the main plaza seeds.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "plaza", 0, 0, 2, 2);
  put(tiles, "artist", "workshop", 2, 0, 2, 2);
  assert.equal(computePlazaConnectivity(tiles).size, 0);
}

// Isolated building and diagonal neighbor: no bonus. Orphan roads: nothing.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  put(tiles, "artist", "workshop", 10, 10, 2, 2);
  put(tiles, "residential", "cottage", 2, 2); // diagonal to plaza corner (1,1)
  road(tiles, 5, 6, 5);
  put(tiles, "materials", "market", 7, 5, 2, 2); // on orphan road chain
  const out = computePlazaConnectivity(tiles);
  assert.ok(!out.has("10,10"));
  assert.ok(!out.has("2,2"));
  assert.ok(!out.has("7,5"));
}

// Multi-tile footprint takes its best-connected cell, keyed by origin.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 0, 0, 2); // (0,2) d=1
  put(tiles, "materials", "market", 1, 2, 2, 2); // cell (1,2) touches plaza (1,1) d=0 AND road (0,2) d=1
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("1,2"), 1);
  assert.equal(out.size, 1);
}

// --- Freeform plaza hubs -----------------------------------------------------

// A 1-wide paving strip never qualifies as a hub: the workshop at its end
// gets plain road falloff, not a refresh.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  for (let x = 2; x <= 25; x++) put(tiles, "road", "plaza_paving", x, 0);
  put(tiles, "artist", "workshop", 26, 0, 2, 2); // touches strip cell d=24
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("26,0"), 1 - 24 / PLAZA_REACH);
}

// An open 7×7 paved square qualifies through its core cells (window fully
// paved, grid-clamped): the road beyond it measures from the campo, not from
// the Town Center.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 2, 5, 0); // d 1..4
  for (let x = 6; x <= 12; x++)
    for (let y = 0; y <= 6; y++) put(tiles, "road", "plaza_paving", x, y);
  road(tiles, 13, 15, 0);
  put(tiles, "artist", "workshop", 16, 0, 2, 2);
  const out = computePlazaConnectivity(tiles);
  // Core cells (window ⊆ paving, y grid-clamped) reset to 0; (15,0) sits 6
  // network steps past the core instead of 14 past the Town Center.
  assert.equal(out.get("16,0"), 1 - 6 / PLAZA_REACH);
}

// A fountain with a mostly-paved surround qualifies: adjacent building and the
// fountain itself both read full strength (its inspiration keeps scaling).
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 2, 5, 0);
  for (let x = 6; x <= 12; x++)
    for (let y = 0; y <= 6; y++) put(tiles, "road", "plaza_paving", x, y);
  put(tiles, "decoration", "fountain", 8, 2, 3, 3); // overwrites 9 paving cells
  put(tiles, "artist", "workshop", 11, 2, 2, 2); // overwrites 4 more; touches the fountain
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("11,2"), 1);
  assert.equal(out.get("8,2"), 1);
}

// Furnishing slack: swapping window cells to a stall doesn't un-hub the piazza.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 2, 5, 0);
  for (let x = 6; x <= 12; x++)
    for (let y = 0; y <= 6; y++) put(tiles, "road", "plaza_paving", x, y);
  put(tiles, "decoration", "fountain", 8, 2, 3, 3);
  put(tiles, "service", "market_stall", 6, 6);
  put(tiles, "service", "market_stall", 12, 6);
  put(tiles, "artist", "workshop", 11, 2, 2, 2);
  const out = computePlazaConnectivity(tiles);
  assert.equal(out.get("11,2"), 1);
}

// Under the threshold nothing resets: sparse paving leaves the fountain an
// ordinary decoration with plain falloff.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  road(tiles, 2, 5, 0);
  for (let x = 6; x <= 12; x++)
    for (let y = 0; y <= 1; y++) put(tiles, "road", "plaza_paving", x, y);
  put(tiles, "decoration", "fountain", 8, 2, 3, 3); // window 9 + 14 paved of 49 < 60%
  const out = computePlazaConnectivity(tiles);
  const s = out.get("8,2");
  assert.ok(s != null && s > 0 && s < 1);
}

// An isolated qualifying campo radiates nothing — same rule as prefab plazas.
{
  const tiles: Record<string, ConnectivityTile> = {};
  put(tiles, "city", "town_center_plaza", 0, 0, 2, 2);
  for (let x = 50; x <= 56; x++)
    for (let y = 50; y <= 56; y++) put(tiles, "road", "plaza_paving", x, y);
  put(tiles, "artist", "workshop", 57, 50, 2, 2);
  const out = computePlazaConnectivity(tiles);
  assert.ok(!out.has("57,50"));
}

console.log("connectivity.check: all assertions passed");
