import assert from "node:assert";

import { tile } from "./checkHelpers.ts";
import type { TileMap } from "./grid.ts";
import { XP_RATES } from "./artists.ts";
import { advanceTick, type TickSnapshot } from "./tick.ts";
import type { Artist, Artwork, Commission } from "./types.ts";

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
    map: { tiles, roads: [] },
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

// A staffed market produces florins (plus the townhouse's occupancy-scaled
// rent) and population still moves by only one.
{
  const tiles = {
    "0,0": tile("townhouse", 0, 0),
    "5,5": inactive("market", 5, 5),
  };
  const out = advanceTick(snapshot(tiles, { population: 3 }), noRandomEvent);
  // population drifts 3->4, housing=8 -> occupancy 0.5; townhouse rent 5*0.5=2.5,
  // market (lone, no DR) 10 -> round(12.5)=13
  assert.equal(out.florins, 113);
  assert.equal(out.population, 4);
  assert.equal(out.tiles["5,5"]?.workers, 3);
}

// House rent scales with occupancy, not raw house count: a freshly-built
// (near-empty) cottage pays a fraction of a full one's rent.
{
  // Population always drifts by 1/month toward the cap, so starting at 0
  // lands at 1 this tick (never a literal 0) -- occupancy 1/4, well under full.
  const nearEmpty = advanceTick(
    snapshot({ "0,0": tile("cottage", 0, 0) }, { population: 0 }),
    noRandomEvent
  );
  assert.equal(nearEmpty.florins, 101); // 2f * (1/4) = 0.5 -> round 1

  const full = advanceTick(
    snapshot({ "0,0": tile("cottage", 0, 0) }, { population: 4 }),
    noRandomEvent
  );
  assert.equal(full.florins, 102); // population == housing, no drift -> occupancy 1 -> full 2f rent
}

// Diminishing returns on duplicate florin-generators: the second market of
// the same kind yields less than the first, geometrically by build order.
{
  const tiles = {
    "0,0": tile("market", 0, 0, { workers: 6, builtTick: 0 }),
    "10,10": tile("market", 10, 10, { workers: 6, builtTick: 1 }),
  };
  const out = advanceTick(snapshot(tiles, { population: 12 }), noRandomEvent);
  // staffingEfficiency(3,6,6)=1.5 each; DR: first x1, second x0.85
  // 10*1.5*(1+0.85) = 27.75 -> round 28
  assert.equal(out.florins, 128);
}

// Foot traffic floor: with zero population the flagged stall earns exactly
// base rate beside a hub (the old model paid the full +100% from day one).
{
  const tiles = {
    "3,3": tile("town_center_plaza", 3, 3),
    "4,3": tile("market_stall", 4, 3), // 4-adjacent to the plaza: strength 1
  };
  const out = advanceTick(snapshot(tiles), noRandomEvent);
  assert.equal(out.florins, 102); // 2 * (1 + 1.0*1*0) — bustle(0)=0 mutes the bonus
}

// Saturated foot traffic reproduces the old ceiling: hub strength 1 × bustle 1
// (pop 64 -> crowd curve 60 = BUSTLE_FULL) × catchment 1 (3 townhouses = 24
// housing beside the plaza, all in the stall's walking reach) doubles 2f -> 4f.
{
  const tiles = {
    "3,3": tile("town_center_plaza", 3, 3),
    "4,3": tile("market_stall", 4, 3),
    "3,2": tile("townhouse", 3, 2),
    "2,3": tile("townhouse", 2, 3),
    "3,4": tile("townhouse", 3, 4),
  };
  const out = advanceTick(snapshot(tiles, { population: 64 }), noRandomEvent);
  // housing: 3 * round(8*1.25) = 30; amenities 15 + round(5*2) = 25 -> cap 25,
  // pop 64 -> 63, occupancy 1; rent 3 * 5*1.25 = 18.75; stall 2*(1+1*1*1*1) = 4
  // -> round(22.75) = 23
  assert.equal(out.florins, 123);
  assert.equal(out.population, 63);
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
  assert.ok(Math.abs(out.artists[0]!.xp! - (XP_RATES.perCompletedWork + XP_RATES.practicePerMonth)) < 1e-9);
}

// A displayed work trickles inspiration city-wide and boosts its host (+5%).
{
  const work: Artwork = {
    id: "w1",
    name: "David",
    artistId: "s1",
    artistType: "sculptor",
    completedTick: 0,
    prestige: 8,
    displayedAt: { key: "3,3", slot: 0 },
  };
  const out = advanceTick(snapshot({ "3,3": tile("plaza", 3, 3) }, { artworks: [work] }), noRandomEvent);
  // plaza inspiration 4 × displayBoost(1)=1.05 → 4.2, plus trickle 8×0.25=2 → round(6.2)=6
  assert.equal(out.inspiration, 6);
}

// A work displayed in a church trickles fractional prestige, not inspiration.
{
  const work: Artwork = {
    id: "w2",
    name: "Madonna",
    artistId: "p1",
    artistType: "painter",
    completedTick: 0,
    prestige: 10,
    displayedAt: { key: "3,3", slot: 0 },
  };
  const out = advanceTick(snapshot({ "3,3": tile("chapel", 3, 3) }, { artworks: [work] }), noRandomEvent);
  assert.equal(out.inspiration, 0); // chapel has no generator; church routes the trickle to prestige
  assert.ok(Math.abs(out.prestige - 0.2) < 1e-9); // 10 × 0.02
}

console.log("tick.check: all assertions passed");
