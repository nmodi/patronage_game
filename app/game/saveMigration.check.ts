import assert from "node:assert";

import { migrateSave, SAVE_VERSION } from "./saveMigration.ts";

const legacy = { florins: 123, map: { tiles: { "1,1": {} } } };
// Every migration below v9 also seeds empty material pools (the stockpile
// rework), and v10 adds the construction pools (timber/stone) on top.
const pools = { materials: { timber: 0, stone: 0, pigment: 0, marble: 0, bronze: 0 } };
assert.deepEqual(migrateSave(legacy, 4), {});
assert.deepEqual(migrateSave(legacy, 5), {
  ...legacy,
  ...pools,
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
  favor: { "The Church": 66, "House Medici": 58 },
});

// v8 → v9 adds the material pools, empty: pre-v9 offers carry no materialCost
// so they stay assignable, and suppliers refill within a few months.
const v8 = { ...legacy, mapSeed: "abc", favor: { "The Church": 66 } };
assert.deepEqual(migrateSave(v8, 8), { ...v8, ...pools });

// v9 → v10 adds the construction pools, keeping earned stock untouched.
const v9 = { ...legacy, mapSeed: "abc", materials: { pigment: 4, marble: 12, bronze: 0 } };
assert.deepEqual(migrateSave(v9, 9), {
  ...v9,
  materials: { timber: 0, stone: 0, pigment: 4, marble: 12, bronze: 0 },
});

const current = { ...legacy, mapSeed: "abc" };
assert.equal(migrateSave(current, SAVE_VERSION), current);
assert.equal(migrateSave(current, SAVE_VERSION + 1), current);

console.log("saveMigration.check: all assertions passed");
