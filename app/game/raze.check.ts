import assert from "node:assert";

import { BUILDING_METADATA_BY_ID, footprintMask, rotatedFootprint } from "./buildings.ts";
import type { TileMap } from "./grid.ts";
import { stamp, tile } from "./checkHelpers.ts";
import { OFFER_EXPIRY_MONTHS } from "./commissions.ts";
import { getRazeImpact, getRazeSalvage, razeBuilding } from "./raze.ts";
import type { Artist, Artwork, Commission } from "./types.ts";

const artist = (id: string, homeTileKey: string): Artist => ({
  id,
  name: id,
  type: "painter",
  rank: "apprentice",
  homeTileKey,
});

const displayed = (id: string, key: string): Artwork => ({
  id,
  name: id,
  artistId: "a",
  artistType: "sculptor",
  completedTick: 0,
  displayedAt: { key, slot: 0 },
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
    artworks: [] as Artwork[],
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
      artworks: [],
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
  assert.equal(result.florins, 10 + getRazeSalvage(tiles, "workshop", originKey));

  assert.equal(result.commissions.length, commissions.length);
  for (const reopened of result.commissions.slice(0, 2)) {
    assert.equal(reopened.workshopKey, undefined);
    assert.equal(reopened.expiresTick, 30 + OFFER_EXPIRY_MONTHS);
  }
  assert.equal(result.commissions[2], remoteAssigned);
  assert.equal(result.commissions[3], staleOpen); // expiry remains tick housekeeping's job

  const impact = getRazeImpact(artists, commissions, [], originKey);
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
      artworks: [],
      commissions,
      map: { tiles },
      time: { tickCount: 30 },
    },
    { x: 2, y: 3 }
  );
  assert.ok(result);
  assert.equal(getRazeSalvage(tiles, "path", "2,3"), 12);
  assert.equal(result.florins, 22);
  assert.equal(result.artists, artists);
  assert.equal(result.commissions, commissions);
  assert.deepEqual(getRazeImpact(artists, commissions, [], null), {
    artistCount: 0,
    commission: undefined,
    displayedWorkCount: 0,
    needsConfirmation: false,
  });
}

// Razing a display host recalls its works to storage; works elsewhere and the
// array identity (when nothing was displayed there) are untouched.
{
  const tiles = stamp("small_plaza", { x: 0, y: 0 }); // origin "0,0"
  const here = displayed("here", "0,0");
  const elsewhere = displayed("elsewhere", "9,9");
  const artworks = [here, elsewhere];
  const result = razeBuilding(
    {
      florins: 0,
      artists: [],
      artworks,
      commissions: [],
      map: { tiles },
      time: { tickCount: 5 },
    },
    { x: 0, y: 0 }
  );
  assert.ok(result);
  assert.equal(result.artworks.find((w) => w.id === "here")!.displayedAt, undefined);
  assert.equal(result.artworks.find((w) => w.id === "elsewhere"), elsewhere); // identity kept

  // Impact counts the work and forces confirmation even for an otherwise-clean host.
  const impact = getRazeImpact([], [], artworks, "0,0");
  assert.equal(impact.displayedWorkCount, 1);
  assert.equal(impact.needsConfirmation, true);

  // Nothing displayed there → artworks array identity preserved.
  const clean = razeBuilding(
    {
      florins: 0,
      artists: [],
      artworks: [elsewhere],
      commissions: [],
      map: { tiles: stamp("small_plaza", { x: 0, y: 0 }) },
      time: { tickCount: 5 },
    },
    { x: 0, y: 0 }
  );
  assert.ok(clean);
  assert.equal(clean.artworks[0], elsewhere);
}

// A diagonal building (rotation 4-7) razes exactly its mask cells: a click on
// any non-anchor mask cell clears the whole mask, and a bystander parked in a
// bounding-box gap the mask never claimed survives untouched.
{
  const origin = { x: 20, y: 20 };
  const rotation = 4;
  const mask = footprintMask(BUILDING_METADATA_BY_ID.workshop, rotation);
  const inMask = new Set(mask.cells.map((c) => `${origin.x + c.x},${origin.y + c.y}`));
  const xs = mask.cells.map((c) => c.x);
  const ys = mask.cells.map((c) => c.y);
  let gapKey = "";
  for (let y = Math.min(...ys); y <= Math.max(...ys) && !gapKey; y += 1) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) {
      const key = `${origin.x + x},${origin.y + y}`;
      if (!inMask.has(key)) {
        gapKey = key;
        break;
      }
    }
  }
  assert.ok(gapKey); // a diagonal mask always leaves bounding-box gaps

  const tiles = stamp("workshop", origin, rotation);
  const [gx, gy] = gapKey.split(",").map(Number) as [number, number];
  const foreign = stamp("path", { x: gx, y: gy })[gapKey]!;
  tiles[gapKey] = foreign;

  const clickCell = mask.cells[1]!; // any non-anchor mask cell
  const result = razeBuilding(
    {
      florins: 0,
      artists: [],
      artworks: [],
      commissions: [],
      map: { tiles },
      time: { tickCount: 0 },
    },
    { x: origin.x + clickCell.x, y: origin.y + clickCell.y }
  );
  assert.ok(result);
  for (const key of inMask) assert.equal(result.tiles[key], undefined);
  assert.equal(result.tiles[gapKey], foreign);
}

// Cost-escalating buildings: salvage tracks the price actually paid for that
// specific tile — the newer of two duplicates refunds more than the older.
{
  const tiles: TileMap = {
    "0,0": tile("workshop", 0, 0, { builtTick: 0 }),
    "10,10": tile("workshop", 10, 10, { builtTick: 1 }),
  };
  assert.equal(getRazeSalvage(tiles, "workshop", "0,0"), 50); // 1st: floor(100 * 0.5)
  assert.equal(getRazeSalvage(tiles, "workshop", "10,10"), 57); // 2nd: floor(round(100*1.15) * 0.5) = floor(57.5)
}

console.log("raze.check: all assertions passed");
