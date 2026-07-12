import assert from "node:assert";

import { BUILDING_METADATA_BY_ID, type BuildingId } from "./buildings.ts";
import { tile } from "./checkHelpers.ts";
import type { TileMap } from "./grid.ts";
import {
  canPlaceAt,
  planLinearPlacement,
  planPlacement,
  type PlacementSnapshot,
} from "./placementRules.ts";
import { getWaterCells } from "./water.ts";

const snapshot = (
  tiles: TileMap = {},
  florins = 10_000,
  mapSeed: string | null = null
): PlacementSnapshot => ({ florins, mapSeed, map: { tiles } });

assert.equal(planPlacement(snapshot(), [], "cottage"), null);
assert.equal(planPlacement(snapshot(), [{ x: 0, y: 0 }], "missing" as BuildingId), null);
assert.equal(planPlacement(snapshot(), [{ x: -1, y: 0 }], "cottage"), null);
assert.equal(planPlacement(snapshot(), [{ x: 117, y: 0 }], "cottage"), null);
assert.equal(planPlacement(snapshot(), [{ x: 0, y: 117 }], "cottage"), null);
assert.ok(planPlacement(snapshot(), [{ x: 115, y: 0 }], "workshop", 1));
assert.equal(planPlacement(snapshot(), [{ x: 115, y: 0 }], "workshop", 0), null);
const cottagePlan = planPlacement(snapshot(), [{ x: 0, y: 0 }], "cottage");
assert.equal(cottagePlan?.totalCost, BUILDING_METADATA_BY_ID.cottage.baseCost);
assert.equal(cottagePlan?.freeCells.size, 16);

{
  const occupied = { "1,0": tile("cottage", 1, 0) };
  const plan = planPlacement(snapshot(occupied), [{ x: 0, y: 0 }], "tree");
  assert.ok(plan);
  assert.equal(plan.freeCells.size, 3);
  assert.ok(!plan.freeCells.has("1,0"));
  assert.equal(
    planPlacement(snapshot({ "0,0": tile("cottage", 0, 0) }), [{ x: 0, y: 0 }], "tree"),
    null
  );
}

assert.equal(planPlacement(snapshot({}, 149), [{ x: 0, y: 0 }], "cottage"), null);
assert.equal(
  planPlacement(snapshot({}, 49), [{ x: 0, y: 0 }, { x: 1, y: 0 }], "path"),
  null
);
assert.equal(
  planPlacement(snapshot(), [{ x: 0, y: 0 }, { x: 0, y: 0 }], "path"),
  null
);

{
  let waterSeed = "";
  let waterCell = "";
  for (let i = 0; i < 100 && !waterCell; i += 1) {
    waterSeed = `placement-water-${i}`;
    waterCell = getWaterCells(waterSeed).values().next().value ?? "";
  }
  assert.ok(waterCell);
  const [x, y] = waterCell.split(",").map(Number) as [number, number];
  assert.equal(planPlacement(snapshot({}, 10_000, waterSeed), [{ x, y }], "path"), null);
  assert.ok(planPlacement(snapshot({}, 10_000, waterSeed), [{ x, y }], "bridge"));

  // The ghost's boolean check agrees with the authoritative planner everywhere.
  const agrees = (
    state: PlacementSnapshot,
    position: { x: number; y: number },
    buildingId: Parameters<typeof canPlaceAt>[2],
    rotation?: number
  ) =>
    assert.equal(
      canPlaceAt(state, position, buildingId, rotation),
      planPlacement(state, [position], buildingId, rotation) != null
    );
  agrees(snapshot(), { x: -1, y: 0 }, "cottage");
  agrees(snapshot(), { x: 117, y: 0 }, "cottage");
  agrees(snapshot(), { x: 115, y: 0 }, "workshop", 1);
  agrees(snapshot(), { x: 115, y: 0 }, "workshop", 0);
  agrees(snapshot(), { x: 0, y: 0 }, "cottage");
  agrees(snapshot({}, 149), { x: 0, y: 0 }, "cottage");
  agrees(snapshot({ "1,0": tile("cottage", 1, 0) }), { x: 0, y: 0 }, "tree");
  agrees(snapshot({ "0,0": tile("cottage", 0, 0) }), { x: 0, y: 0 }, "tree");
  agrees(snapshot({}, 10_000, waterSeed), { x, y }, "path");
  agrees(snapshot({}, 10_000, waterSeed), { x, y }, "bridge");
}

{
  const tiles = { "0,0": tile("path", 0, 0) };
  const plan = planLinearPlacement(snapshot(tiles), [{ x: 0, y: 0 }, { x: 1, y: 0 }], "road");
  assert.deepEqual(plan?.positions, [{ x: 1, y: 0 }]);
  assert.equal(plan?.totalCost, BUILDING_METADATA_BY_ID.road.baseCost);
  assert.equal(planLinearPlacement(snapshot(tiles), [{ x: 0, y: 0 }], "road")?.totalCost, 0);
}

{
  const fence = { "0,0": tile("fence", 0, 0) };
  assert.deepEqual(
    planLinearPlacement(snapshot(fence), [{ x: 0, y: 0 }, { x: 1, y: 0 }], "fence")?.positions,
    [{ x: 1, y: 0 }]
  );
  const wall = { "0,0": tile("stone_wall", 0, 0) };
  assert.equal(planLinearPlacement(snapshot(wall), [{ x: 0, y: 0 }], "fence"), null);
  assert.equal(planLinearPlacement(snapshot(fence), [{ x: 0, y: 0 }], "road"), null);
}

console.log("placementRules.check: all assertions passed");
