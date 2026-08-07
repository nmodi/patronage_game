import assert from "node:assert";

import { migrateSave, SAVE_VERSION } from "./saveMigration.ts";

const legacy = { florins: 123, map: { tiles: { "1,1": {} } } };
// Every migration below v9 also seeds empty material pools (the stockpile
// rework), and v10 adds the construction pools (timber/stone) on top.
const pools = { materials: { timber: 0, stone: 0, pigment: 0, marble: 0, bronze: 0 } };
// And every migration below v12 seeds the discipline pools — zeros when no
// (typed) artists exist to seed from.
const noTradition = { disciplineXp: { painter: 0, sculptor: 0, architect: 0 } };
assert.deepEqual(migrateSave(legacy, 4), {});
assert.deepEqual(migrateSave(legacy, 5), {
  ...legacy,
  ...pools,
  ...noTradition,
  mapSeed: null,
  artists: [],
  favor: {},
});

// v6 → v7 rescales artist XP ×100; ranks are untouched.
const v6 = {
  ...legacy,
  mapSeed: "abc",
  artists: [{ rank: "journeyman", xp: 5.5 }, { rank: "apprentice" }],
};
assert.deepEqual(migrateSave(v6, 6), {
  ...v6,
  ...pools,
  ...noTradition, // fixtures are typeless — nothing to attribute
  artists: [
    { rank: "journeyman", xp: 550 },
    { rank: "apprentice", xp: 0 },
  ],
  favor: {},
});

// v7 → v8 seeds per-faction favor from completed works (+8 each from 50,
// clamped at 100) — old saves keep the standing they earned.
const v7 = {
  ...legacy,
  mapSeed: "abc",
  artworks: [
    { requester: "The Church" },
    { requester: "The Church" },
    { requester: "House Medici" },
    { name: "unattributed" },
  ],
};
assert.deepEqual(migrateSave(v7, 7), {
  ...v7,
  ...pools,
  ...noTradition,
  favor: { "The Church": 66, "House Medici": 58 },
});

// v8 → v9 adds the material pools, empty: pre-v9 offers carry no materialCost
// so they stay assignable, and suppliers refill within a few months.
const v8 = { ...legacy, mapSeed: "abc", favor: { "The Church": 66 } };
assert.deepEqual(migrateSave(v8, 8), { ...v8, ...pools, ...noTradition });

// v9 → v10 adds the construction pools, keeping earned stock untouched.
const v9 = { ...legacy, mapSeed: "abc", materials: { pigment: 4, marble: 12, bronze: 0 } };
assert.deepEqual(migrateSave(v9, 9), {
  ...v9,
  ...noTradition,
  materials: { timber: 0, stone: 0, pigment: 4, marble: 12, bronze: 0 },
});

// v10 → v11 strips the removed baptistery and loggia: tiles, blueprint
// commissions, and funded-build tokens go; works displayed on them return to
// storage; everything else (including completed designs in the gallery) is
// untouched.
const v10 = {
  ...legacy,
  mapSeed: "abc",
  map: { tiles: { "1,1": {}, "3,3": { buildingId: "baptistery", isOrigin: true }, "5,5": { buildingId: "loggia", isOrigin: true }, "3,4": { buildingId: "baptistery" } } },
  commissions: [{ building: "baptistery" }, { building: "loggia" }, { title: "A Fresco" }],
  fundedBuilds: ["baptistery", "loggia"],
  artworks: [
    { requester: "The Church", displayedAt: { key: "3,3", slot: 0 } },
    { requester: "House Strozzi", displayedAt: { key: "5,5", slot: 0 } },
    { requester: "House Medici", displayedAt: { key: "9,9", slot: 1 } },
  ],
};
assert.deepEqual(migrateSave(v10, 10), {
  ...v10,
  ...noTradition,
  map: { tiles: { "1,1": {} } },
  commissions: [{ title: "A Fresco" }],
  fundedBuilds: [],
  artworks: [
    { requester: "The Church", displayedAt: undefined },
    { requester: "House Strozzi", displayedAt: undefined },
    { requester: "House Medici", displayedAt: { key: "9,9", slot: 1 } },
  ],
});
// A v10 save with no blueprint structures gains only the discipline pools.
const cleanV10 = { ...legacy, mapSeed: "abc" };
assert.deepEqual(migrateSave(cleanV10, 10), { ...cleanV10, ...noTradition });

// v11 → v12 seeds each discipline pool to the per-type max of artists' xp —
// conservative: the 0.25 floor of a max never promotes anyone at load.
// Typeless pre-rework artists can't be attributed and are skipped.
const v11 = {
  ...legacy,
  mapSeed: "abc",
  artists: [
    { type: "painter", xp: 900 },
    { type: "painter", xp: 2400 },
    { type: "architect", xp: 75 },
    { rank: "apprentice" },
  ],
};
assert.deepEqual(migrateSave(v11, 11), {
  ...v11,
  disciplineXp: { painter: 2400, sculptor: 0, architect: 75 },
});

const current = { ...legacy, mapSeed: "abc" };
assert.equal(migrateSave(current, SAVE_VERSION), current);
assert.equal(migrateSave(current, SAVE_VERSION + 1), current);

console.log("saveMigration.check: all assertions passed");
