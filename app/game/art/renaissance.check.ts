// Self-check for the Renaissance milestone gates.
// Run: node --experimental-strip-types app/game/renaissance.check.ts
import assert from "node:assert";

import {
  EMPTY_DISCIPLINE_XP,
  RENAISSANCE_PRESTIGE,
  RENAISSANCE_TRADITION_XP,
  WONDER_PRESTIGE,
} from "../constants.ts";
import { renaissanceProgress } from "./renaissance.ts";
import type { DisciplineXp } from "./artists.ts";
import type { Artwork } from "../types.ts";

const pools = (extra: Partial<DisciplineXp> = {}): DisciplineXp => ({
  ...EMPTY_DISCIPLINE_XP,
  ...extra,
});

const work = (requester: string, prestige = 5, displayed = false): Artwork => ({
  id: crypto.randomUUID(),
  name: "Test Work",
  requester,
  artistId: "a",
  artistType: "painter",
  completedTick: 0,
  prestige,
  ...(displayed ? { displayedAt: { key: "1,1", slot: 0 } } : {}),
});

// A fully qualifying city.
const master = pools({ painter: RENAISSANCE_TRADITION_XP });
const patronWorks = [
  work("The Church"),
  work("House Medici", WONDER_PRESTIGE, true),
  work("House Strozzi"),
];

// Empty city: nothing met.
{
  const p = renaissanceProgress(0, pools(), []);
  assert.deepEqual(
    [p.prestige, p.master, p.wonder, p.church, p.nobleHouses, p.all],
    [false, false, null, false, 0, false]
  );
}

// Each gate flips on its boundary; all requires all four.
assert.ok(renaissanceProgress(RENAISSANCE_PRESTIGE, master, patronWorks).all);
assert.ok(!renaissanceProgress(RENAISSANCE_PRESTIGE - 1, master, patronWorks).all);
assert.ok(
  !renaissanceProgress(
    RENAISSANCE_PRESTIGE,
    pools({ painter: RENAISSANCE_TRADITION_XP - 1 }),
    patronWorks
  ).all
);
assert.ok(renaissanceProgress(0, pools({ sculptor: RENAISSANCE_TRADITION_XP }), []).master);
// The construction-fed architect pool never satisfies the mastery gate.
assert.ok(!renaissanceProgress(0, pools({ architect: RENAISSANCE_TRADITION_XP * 10 }), []).master);

// Wonder: must be displayed and at the quality bar.
{
  const undisplayed = [work("The Church"), work("House Medici", WONDER_PRESTIGE), work("House Strozzi")];
  const p = renaissanceProgress(RENAISSANCE_PRESTIGE, master, undisplayed);
  assert.equal(p.wonder, null);
  assert.ok(!p.all);
  const dim = [work("The Church"), work("House Medici", WONDER_PRESTIGE - 1, true), work("House Strozzi")];
  assert.equal(renaissanceProgress(0, pools(), dim).wonder, null);
  assert.equal(renaissanceProgress(0, pools(), patronWorks).wonder?.requester, "House Medici");
}

// Patrons: Church AND two distinct houses; guilds count for neither.
{
  const oneHouse = [work("The Church"), work("House Medici", WONDER_PRESTIGE, true)];
  assert.ok(!renaissanceProgress(RENAISSANCE_PRESTIGE, master, oneHouse).all);
  const sameHouseTwice = [...oneHouse, work("House Medici")];
  assert.equal(renaissanceProgress(0, pools(), sameHouseTwice).nobleHouses, 1);
  const noChurch = [work("House Medici", WONDER_PRESTIGE, true), work("House Strozzi")];
  assert.ok(!renaissanceProgress(RENAISSANCE_PRESTIGE, master, noChurch).all);
  const guilds = [work("The Wool Guild"), work("The Silk Guild")];
  const p = renaissanceProgress(0, pools(), guilds);
  assert.equal(p.church, false);
  assert.equal(p.nobleHouses, 0);
}

console.log("renaissance.check.ts: all assertions passed");
