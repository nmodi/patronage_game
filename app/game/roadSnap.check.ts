import assert from "node:assert";

import { BUILDING_METADATA_BY_ID, footprintMask } from "./buildings.ts";
import { tile } from "./checkHelpers.ts";
import type { TileMap } from "./grid.ts";
import type { PlacementSnapshot } from "./placementRules.ts";
import { findRoadSnap } from "./roadSnap.ts";
import { ROAD_DIAG_NE } from "./roadStretch.ts";

const snapshot = (tiles: TileMap): PlacementSnapshot => ({
  florins: 10_000,
  mapSeed: null,
  map: { tiles },
});

/** A horizontal road row at y=10, x 5..15. */
function roadRow(): TileMap {
  const tiles: TileMap = {};
  for (let x = 5; x <= 15; x += 1) tiles[`${x},10`] = tile("path", x, 10);
  return tiles;
}

// Cardinal flush: a cottage (4×4, front local +X) above the road faces down
// (+y → front solve r=3) and sits flush; the slide axis follows the cursor.
{
  const state = snapshot(roadRow());
  const snap = findRoadSnap(state, { x: 10.3, y: 8.5 }, "cottage", null);
  assert.ok(snap);
  assert.equal(snap.rotation, 3); // front +X turned to face grid +y
  assert.equal(snap.origin.y, 6); // 10 − depth(4): flush above the road
  assert.equal(snap.origin.x, 8); // round(10.3 − 2)

  const slid = findRoadSnap(state, { x: 12.7, y: 8.5 }, "cottage", null);
  assert.deepEqual(slid?.origin, { x: 11, y: 6 });

  // Below the road, the front turns the other way (−y → r=1), origin flush below.
  const below = findRoadSnap(state, { x: 10.3, y: 12.5 }, "cottage", null);
  assert.equal(below?.rotation, 1);
  assert.equal(below?.origin.y, 11);
}

// A blocked flush spot yields a different (still valid) candidate, and a map
// with no roads in range yields null.
{
  const tiles = roadRow();
  // Park a cottage exactly where the previous case snapped to.
  for (const c of footprintMask(BUILDING_METADATA_BY_ID.cottage, 3).cells) {
    const key = `${8 + c.x},${6 + c.y}`;
    tiles[key] = tile("cottage", 8 + c.x, 6 + c.y, { origin: { x: 8, y: 6 }, isOrigin: false });
  }
  tiles["8,6"] = tile("cottage", 8, 6, { rotation: 3 });
  const snap = findRoadSnap(snapshot(tiles), { x: 10.3, y: 8.5 }, "cottage", null);
  assert.ok(snap);
  assert.ok(!(snap.origin.x === 8 && snap.origin.y === 6));

  assert.equal(findRoadSnap(snapshot({}), { x: 10, y: 10 }, "cottage", null), null);
  assert.equal(findRoadSnap(snapshot(roadRow()), { x: 40, y: 40 }, "cottage", null), null);
}

// Diagonal ribbon: the cottage rotates to 4-7, its mask never overlaps the
// road, and it sits flush (some mask cell orthogonally adjacent to the road).
{
  const tiles: TileMap = {};
  const roadKeys = new Set<string>();
  for (let i = 0; i <= 10; i += 1) {
    tiles[`${20 + i},${20 + i}`] = tile("road", 20 + i, 20 + i, { rotation: ROAD_DIAG_NE });
    roadKeys.add(`${20 + i},${20 + i}`);
  }
  for (const { cursor, expected } of [
    { cursor: { x: 27.5, y: 23.5 }, expected: 6 }, // upper (y−x < 0) side: front (−1,+1)
    { cursor: { x: 23.5, y: 27.5 }, expected: 4 }, // lower side: front (+1,−1)
  ]) {
    const snap = findRoadSnap(snapshot(tiles), cursor, "cottage", null);
    assert.ok(snap, `no diagonal snap for cursor ${cursor.x},${cursor.y}`);
    assert.equal(snap.rotation, expected, `rotation ${snap.rotation}, expected ${expected}`);
    const mask = footprintMask(BUILDING_METADATA_BY_ID.cottage, snap.rotation);
    let touches = false;
    for (const c of mask.cells) {
      const x = snap.origin.x + c.x;
      const y = snap.origin.y + c.y;
      assert.ok(!roadKeys.has(`${x},${y}`), "mask overlaps the road");
      touches ||=
        roadKeys.has(`${x + 1},${y}`) ||
        roadKeys.has(`${x - 1},${y}`) ||
        roadKeys.has(`${x},${y + 1}`) ||
        roadKeys.has(`${x},${y - 1}`);
    }
    assert.ok(touches, "mask does not kiss the ribbon");
  }

  // The two sides face opposite ways.
  const upper = findRoadSnap(snapshot(tiles), { x: 27.5, y: 23.5 }, "cottage", null);
  const lower = findRoadSnap(snapshot(tiles), { x: 23.5, y: 27.5 }, "cottage", null);
  assert.notEqual(upper?.rotation, lower?.rotation);
}

// Regression (found in E2E against the demo city): with a NW lane also in
// range, its wrongly-faced candidate must not win by kissing the *NE* road —
// diagonal flushness requires a road cell of the ribbon orientation the
// rotation was solved against.
{
  const tiles: TileMap = {};
  for (let i = 0; i <= 11; i += 1) {
    for (const x of [34 + i, 35 + i]) {
      tiles[`${x},${68 + i}`] = tile("road", x, 68 + i, { rotation: ROAD_DIAG_NE });
    }
  }
  for (let i = 0; i <= 6; i += 1) {
    tiles[`${49 + i},${68 - i}`] = tile("path", 49 + i, 68 - i, { rotation: 3 });
  }
  const snap = findRoadSnap(snapshot(tiles), { x: 44.5, y: 74 }, "cottage", null);
  assert.ok(snap);
  assert.equal(snap.rotation, 6, `expected NE-road facing (6), got ${snap.rotation}`);
}

// Front-less buildings keep the caller's rotation and only snap position.
{
  const front = (await import("./render/modelManifest.ts")).getFrontDirection("fountain");
  assert.equal(front, null); // precondition: fountain has no front
  const snap = findRoadSnap(snapshot(roadRow()), { x: 10, y: 8.7 }, "fountain", 2);
  assert.ok(snap);
  assert.equal(snap.rotation, 2);
}

// Determinism: identical inputs, identical output.
{
  const state = snapshot(roadRow());
  assert.deepEqual(
    findRoadSnap(state, { x: 9.4, y: 12.2 }, "workshop", null),
    findRoadSnap(state, { x: 9.4, y: 12.2 }, "workshop", null)
  );
}

console.log("roadSnap.check: all assertions passed");
