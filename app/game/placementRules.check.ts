import assert from "node:assert";

import { BUILDING_METADATA_BY_ID, footprintMask, type BuildingId } from "./buildings.ts";
import { stamp, tile } from "./checkHelpers.ts";
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

  // Diagonal rotations agree too — including the map edge, where the mask's
  // negative x offsets must reject the anchor even though it's in bounds.
  agrees(snapshot(), { x: 40, y: 40 }, "workshop", 4);
  agrees(snapshot(), { x: 40, y: 40 }, "workshop", 5);
  agrees(snapshot(), { x: 0, y: 0 }, "workshop", 4);
  agrees(snapshot({}, 10_000, waterSeed), { x, y }, "workshop", 4);
  assert.ok(canPlaceAt(snapshot(), { x: 40, y: 40 }, "workshop", 4));
  assert.equal(canPlaceAt(snapshot(), { x: 0, y: 0 }, "workshop", 4), false);

  // Linear runs hit the same water gate: blocked for roads, exempt for bridges.
  assert.equal(planLinearPlacement(snapshot({}, 10_000, waterSeed), [{ x, y }], "road"), null);
  assert.ok(planLinearPlacement(snapshot({}, 10_000, waterSeed), [{ x, y }], "bridge"));

  // placesOnRoads (market stall): overwrites a plain road cell — the road key
  // joins freeCells so placeTiles writes over it — but never a bridge deck
  // (water or land causeway), a diagonal ribbon cell, a plaza cell, or another
  // building. Grass placement still works (the rule only adds permission).
  {
    const road = { "5,5": tile("path", 5, 5) };
    const stallPlan = planPlacement(snapshot(road), [{ x: 5, y: 5 }], "market_stall");
    assert.ok(stallPlan);
    assert.ok(stallPlan.freeCells.has("5,5"));

    const diagonal = { "5,5": tile("path", 5, 5, { rotation: 1 }) };
    assert.equal(planPlacement(snapshot(diagonal), [{ x: 5, y: 5 }], "market_stall"), null);

    const bridgeOnWater = { [waterCell]: tile("bridge", x, y) };
    assert.equal(
      planPlacement(snapshot(bridgeOnWater, 10_000, waterSeed), [{ x, y }], "market_stall"),
      null
    );
    const causeway = { "6,6": tile("bridge", 6, 6) };
    assert.equal(planPlacement(snapshot(causeway), [{ x: 6, y: 6 }], "market_stall"), null);

    const plaza = stamp("town_center_plaza", { x: 30, y: 30 });
    assert.equal(planPlacement(snapshot(plaza), [{ x: 30, y: 30 }], "market_stall"), null);
    const house = { "5,5": tile("cottage", 5, 5) };
    assert.equal(planPlacement(snapshot(house), [{ x: 5, y: 5 }], "market_stall"), null);
    assert.ok(planPlacement(snapshot(), [{ x: 5, y: 5 }], "market_stall"));

    agrees(snapshot(road), { x: 5, y: 5 }, "market_stall");
    agrees(snapshot(diagonal), { x: 5, y: 5 }, "market_stall");
    agrees(snapshot(bridgeOnWater, 10_000, waterSeed), { x, y }, "market_stall");
    agrees(snapshot(causeway), { x: 6, y: 6 }, "market_stall");
    agrees(snapshot(plaza), { x: 30, y: 30 }, "market_stall");
    agrees(snapshot(), { x: 5, y: 5 }, "market_stall");
  }
}

// Cost-escalating buildings (workshops/suppliers/services): each duplicate of
// the same building id costs progressively more, priced by how many already
// stand; other types (housing here) stay flat regardless of count.
{
  const oneWorkshop = { "0,0": tile("workshop", 0, 0) };
  const secondPlan = planPlacement(snapshot(oneWorkshop), [{ x: 20, y: 0 }], "workshop");
  assert.equal(secondPlan?.totalCost, 115); // round(100 * 1.15)

  const twoWorkshops = { ...oneWorkshop, "20,0": tile("workshop", 20, 0, { builtTick: 1 }) };
  const thirdPlan = planPlacement(snapshot(twoWorkshops), [{ x: 40, y: 0 }], "workshop");
  assert.equal(thirdPlan?.totalCost, 132); // round(100 * 1.15^2) = round(132.25)

  // A batch of 2 new workshops in one call prices progressively too, not 2x flat.
  const batchPlan = planPlacement(snapshot(), [{ x: 0, y: 0 }, { x: 20, y: 0 }], "workshop");
  assert.equal(batchPlan?.totalCost, 215); // 100 + 115

  // Non-escalating buildings (residential) stay flat per unit regardless of count.
  const oneCottage = { "0,0": tile("cottage", 0, 0) };
  const secondCottage = planPlacement(snapshot(oneCottage), [{ x: 10, y: 0 }], "cottage");
  assert.equal(secondCottage?.totalCost, BUILDING_METADATA_BY_ID.cottage.baseCost);

  // The ghost's afford check matches the planner's escalated price (115ƒ for
  // the 2nd workshop, not the flat 100ƒ base).
  assert.equal(canPlaceAt(snapshot(oneWorkshop, 115), { x: 20, y: 0 }, "workshop"), true);
  assert.equal(canPlaceAt(snapshot(oneWorkshop, 114), { x: 20, y: 0 }, "workshop"), false);
}

// Diagonal placement claims the mask, not its bounding box: a bystander in a
// bounding-box gap neither blocks the plan nor gets claimed, while a tile on
// a real mask cell blocks.
{
  const origin = { x: 40, y: 40 };
  const mask = footprintMask(BUILDING_METADATA_BY_ID.workshop, 4);
  const inMask = new Set(mask.cells.map((c) => `${origin.x + c.x},${origin.y + c.y}`));
  const xs = mask.cells.map((c) => c.x);
  const ys = mask.cells.map((c) => c.y);
  let gapKey = "";
  for (let gy = Math.min(...ys); gy <= Math.max(...ys) && !gapKey; gy += 1) {
    for (let gx = Math.min(...xs); gx <= Math.max(...xs); gx += 1) {
      const key = `${origin.x + gx},${origin.y + gy}`;
      if (!inMask.has(key)) {
        gapKey = key;
        break;
      }
    }
  }
  assert.ok(gapKey);
  const [bx, by] = gapKey.split(",").map(Number) as [number, number];
  const bystander = { [gapKey]: tile("cottage", bx, by) };
  const plan = planPlacement(snapshot(bystander), [origin], "workshop", 4);
  assert.ok(plan);
  assert.equal(plan.freeCells.size, mask.cells.length);
  assert.ok(!plan.freeCells.has(gapKey));

  const blockCell = mask.cells[1]!;
  const blockKey = `${origin.x + blockCell.x},${origin.y + blockCell.y}`;
  const blocked = { [blockKey]: tile("cottage", origin.x + blockCell.x, origin.y + blockCell.y) };
  assert.equal(planPlacement(snapshot(blocked), [origin], "workshop", 4), null);
}

// Linear placement charges only new cells and rejects duplicates/short funds.
assert.equal(planLinearPlacement(snapshot({}, 24), [{ x: 0, y: 0 }], "path"), null);
assert.equal(
  planLinearPlacement(snapshot(), [{ x: 0, y: 0 }, { x: 0, y: 0 }], "road"),
  null
);

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
