import assert from "node:assert";

import { tile } from "./checkHelpers.ts";
import type { TileMap } from "./grid.ts";
import { advanceTick, type TickSnapshot } from "./tick.ts";
import type { Artist, Commission } from "./types.ts";

// Unstaffed buildings start inactive; advanceTick recomputes staffing itself.
const inactive = (buildingId: Parameters<typeof tile>[0], x: number, y: number) =>
  tile(buildingId, x, y, { isActive: false });

function snapshot(tiles: TileMap, extra: Partial<TickSnapshot> = {}): TickSnapshot {
  return {
    florins: 100,
    inspiration: 0,
    prestige: 0,
    population: 0,
    artists: [],
    artworks: [],
    commissions: [],
    time: { tickCount: 10 },
    map: { tiles },
    ...extra,
  };
}

const noRandomEvent = () => 1;

// Staffing activates amenities before this month's population cap is applied.
{
  const tiles = {
    "0,0": tile("cottage", 0, 0),
    "5,5": inactive("bakery", 5, 5),
  };
  const out = advanceTick(snapshot(tiles, { population: 1 }), noRandomEvent);
  assert.equal(out.tiles["5,5"]?.isActive, true);
  assert.equal(out.tiles["5,5"]?.workers, 1);
  assert.equal(out.population, 2);
  assert.equal(out.tickCount, 11);
}

// A staffed market produces florins and population still moves by only one.
{
  const tiles = {
    "0,0": tile("townhouse", 0, 0),
    "5,5": inactive("market", 5, 5),
  };
  const out = advanceTick(snapshot(tiles, { population: 3 }), noRandomEvent);
  assert.equal(out.florins, 110);
  assert.equal(out.population, 4);
  assert.equal(out.tiles["5,5"]?.workers, 3);
}

// A working painter without pigment capacity remains stalled after staffing.
{
  const founder: Artist = {
    id: "p1",
    name: "Painter",
    type: "painter",
    rank: "apprentice",
    homeTileKey: "5,5",
    workProgress: 0,
  };
  const commission: Commission = {
    id: "c1",
    title: "Fresco",
    requester: "The Church",
    artistType: "painter",
    durationMonths: 4,
    florins: 50,
    prestige: 2,
    expiresTick: 99,
    workshopKey: "5,5",
  };
  const out = advanceTick(
    snapshot({ "5,5": inactive("workshop", 5, 5) }, {
      population: 2,
      inspiration: 1,
      artists: [founder],
      commissions: [commission],
    }),
    noRandomEvent
  );
  assert.equal(out.tiles["5,5"]?.workers, 2);
  assert.equal(out.tiles["5,5"]?.isActive, false);
  assert.equal(out.artists[0]?.workProgress, 0);
}

// A supplied, staffed workshop completes its commission and receives rewards.
{
  const founder: Artist = {
    id: "p1",
    name: "Painter",
    type: "painter",
    rank: "apprentice",
    homeTileKey: "5,5",
    workProgress: 0,
  };
  const commission: Commission = {
    id: "c1",
    title: "Fresco",
    requester: "The Church",
    artistType: "painter",
    durationMonths: 1,
    florins: 50,
    prestige: 2,
    expiresTick: 99,
    workshopKey: "5,5",
  };
  const out = advanceTick(
    snapshot(
      {
        "5,5": inactive("workshop", 5, 5),
        "10,10": inactive("pigment_trader", 10, 10),
      },
      {
        population: 4,
        inspiration: 1,
        artists: [founder],
        commissions: [commission],
      }
    ),
    noRandomEvent
  );
  assert.equal(out.florins, 150);
  assert.equal(out.prestige, 2);
  assert.equal(out.commissions.length, 0);
  assert.equal(out.artworks.length, 1);
  assert.equal(out.artworks[0]?.name, "Fresco");
  assert.equal(out.artists[0]?.workProgress, undefined);
  assert.equal(out.artists[0]?.xp, 1);
}

console.log("tick.check: all assertions passed");
