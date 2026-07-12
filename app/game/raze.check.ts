import assert from "node:assert";

import { BUILDING_METADATA_BY_ID, rotatedFootprint } from "./buildings.ts";
import type { TileMap } from "./grid.ts";
import { stamp } from "./checkHelpers.ts";
import { OFFER_EXPIRY_MONTHS } from "./commissions.ts";
import { getRazeImpact, getRazeSalvage, razeBuilding } from "./raze.ts";
import type { Artist, Commission } from "./types.ts";

const artist = (id: string, homeTileKey: string): Artist => ({
  id,
  name: id,
  type: "painter",
  rank: "apprentice",
  homeTileKey,
});

const commission = (
  id: string,
  workshopKey: string | undefined,
  expiresTick = 999
): Commission => ({
  id,
  title: id,
  requester: "The Church",
  artistType: "painter",
  durationMonths: 4,
  florins: 50,
  prestige: 3,
  expiresTick,
  workshopKey,
});

// Missing cells are a true no-op, leaving every input reference untouched.
{
  const tiles: TileMap = {};
  const artists = [artist("remote", "9,9")];
  const commissions = [commission("open", undefined)];
  const state = {
    florins: 10,
    artists,
    commissions,
    map: { tiles },
    time: { tickCount: 30 },
  };
  assert.equal(razeBuilding(state, { x: 1, y: 1 }), null);
  assert.equal(state.map.tiles, tiles);
  assert.equal(state.artists, artists);
  assert.equal(state.commissions, commissions);
}

// A non-origin click removes the rotated footprint, preserves a foreign overlap,
// evicts only its artists, and reopens every commission assigned there.
{
  const origin = { x: 4, y: 7 };
  const originKey = "4,7";
  const rotation = 1;
  const tiles = stamp("workshop", origin, rotation);
  const foreignKey = "5,8";
  const foreign = stamp("path", { x: 5, y: 8 })[foreignKey]!;
  tiles[foreignKey] = foreign;

  const homedA = artist("a", originKey);
  const homedB = artist("b", originKey);
  const remote = artist("remote", "9,9");
  const assignedA = commission("assigned-a", originKey, 1);
  const assignedB = commission("assigned-b", originKey, 2);
  const remoteAssigned = commission("remote-assigned", "9,9", 3);
  const staleOpen = commission("stale-open", undefined, 1);
  const artists = [homedA, homedB, remote];
  const commissions = [assignedA, assignedB, remoteAssigned, staleOpen];
  const result = razeBuilding(
    {
      florins: 10,
      artists,
      commissions,
      map: { tiles },
      time: { tickCount: 30 },
    },
    { x: 7, y: 12 }
  );

  assert.ok(result);
  const footprint = rotatedFootprint(BUILDING_METADATA_BY_ID.workshop, rotation);
  for (let dx = 0; dx < footprint.width; dx += 1) {
    for (let dy = 0; dy < footprint.depth; dy += 1) {
      const key = `${origin.x + dx},${origin.y + dy}`;
      if (key === foreignKey) assert.equal(result.tiles[key], foreign);
      else assert.equal(result.tiles[key], undefined);
    }
  }
  assert.ok(tiles[originKey]); // input map was not mutated
  assert.deepEqual(result.artists, [remote]);
  assert.equal(result.artists[0], remote);
  assert.equal(result.florins, 10 + getRazeSalvage("workshop"));

  assert.equal(result.commissions.length, commissions.length);
  for (const reopened of result.commissions.slice(0, 2)) {
    assert.equal(reopened.workshopKey, undefined);
    assert.equal(reopened.expiresTick, 30 + OFFER_EXPIRY_MONTHS);
  }
  assert.equal(result.commissions[2], remoteAssigned);
  assert.equal(result.commissions[3], staleOpen); // expiry remains tick housekeeping's job

  const impact = getRazeImpact(artists, commissions, originKey);
  assert.equal(impact.artistCount, 2);
  assert.equal(impact.commission, assignedA);
  assert.equal(impact.needsConfirmation, true);
}

// Odd build costs round down, and unaffected arrays retain their identity.
{
  const tiles = stamp("path", { x: 2, y: 3 });
  const artists = [artist("remote", "9,9")];
  const commissions = [commission("open", undefined, 0)];
  const result = razeBuilding(
    {
      florins: 10,
      artists,
      commissions,
      map: { tiles },
      time: { tickCount: 30 },
    },
    { x: 2, y: 3 }
  );
  assert.ok(result);
  assert.equal(getRazeSalvage("path"), 12);
  assert.equal(result.florins, 22);
  assert.equal(result.artists, artists);
  assert.equal(result.commissions, commissions);
  assert.deepEqual(getRazeImpact(artists, commissions, null), {
    artistCount: 0,
    commission: undefined,
    needsConfirmation: false,
  });
}

console.log("raze.check: all assertions passed");
