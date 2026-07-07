// Self-check for passive artist arrival.
// Run: node --experimental-strip-types app/game/artists.check.ts
import assert from "node:assert";

import {
  createArtist,
  maybeArriveArtist,
  progressArtworks,
  ARTIST_ARRIVAL_CHANCE,
  ARTIST_ARRIVAL_COOLDOWN_MONTHS,
  RANK_XP,
  WORK_DURATION_MONTHS,
  type AtelierSlot,
} from "./artists.ts";
import type { Artist } from "./types.ts";

const readyTick = ARTIST_ARRIVAL_COOLDOWN_MONTHS;
const atelier = (key: string, capacity = 2, isActive = true, builtTick = 0): AtelierSlot => ({
  key,
  capacity,
  isActive,
  builtTick,
});
// rng that returns a fixed sequence, then 0s. First draw gates arrival.
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++] ?? 0;
};
const win = () => 0; // always below ARTIST_ARRIVAL_CHANCE → arrival + picks index 0
const lose = () => ARTIST_ARRIVAL_CHANCE; // >= chance → no arrival

// Winning roll binds an apprentice to the (only) atelier.
{
  const out = maybeArriveArtist([atelier("5,5")], [], 3, readyTick, win);
  assert.ok(out);
  assert.equal(out.homeTileKey, "5,5");
  assert.equal(out.rank, "apprentice");
  assert.ok(out.type === "painter" || out.type === "sculptor");
}

// Gated off: no inspiration, inactive atelier, losing roll → null.
assert.equal(maybeArriveArtist([atelier("5,5")], [], 0, readyTick, win), null);
assert.equal(maybeArriveArtist([atelier("5,5", 2, false)], [], 3, readyTick, win), null);
assert.equal(maybeArriveArtist([atelier("5,5")], [], 3, readyTick, lose), null);

// Newly built ateliers wait a short cooldown before artists can arrive.
assert.equal(
  maybeArriveArtist([atelier("5,5", 2, true, readyTick)], [], 3, readyTick, win),
  null
);
assert.ok(maybeArriveArtist([atelier("5,5", 2, true, 0)], [], 3, readyTick, win));

// Full atelier → null even on a winning roll.
{
  const full: Artist[] = [
    { id: "a", name: "x", type: "painter", rank: "apprentice", homeTileKey: "5,5" },
    { id: "b", name: "y", type: "sculptor", rank: "apprentice", homeTileKey: "5,5" },
  ];
  assert.equal(maybeArriveArtist([atelier("5,5", 2)], full, 3, readyTick, win), null);
}

// Two open ateliers → first by key sort wins, regardless of input order.
{
  const out = maybeArriveArtist([atelier("9,1"), atelier("2,8")], [], 3, readyTick, win);
  assert.equal(out?.homeTileKey, "2,8");
}

// A full atelier is skipped so a second open one still receives the artist.
{
  const one: Artist[] = [{ id: "a", name: "x", type: "painter", rank: "apprentice", homeTileKey: "2,8" }];
  const out = maybeArriveArtist([atelier("2,8", 1), atelier("9,1")], one, 3, readyTick, seq(0, 0, 0));
  assert.equal(out?.homeTileKey, "9,1");
}

// --- createArtist (founders spawn with the atelier) ---
{
  const a = createArtist("7,3", win);
  assert.equal(a.homeTileKey, "7,3");
  assert.equal(a.rank, "apprentice");
  assert.ok(a.type === "painter" || a.type === "sculptor");
  assert.ok(a.name.length > 0);
}

// --- progressArtworks (Phase 6, atelier-level) ---

const painter = (extra: Partial<Artist> = {}): Artist => ({
  id: "p1",
  name: "x",
  type: "painter",
  rank: "apprentice",
  homeTileKey: "5,5",
  ...extra,
});

// Solo founder at an active atelier advances one month.
{
  const out = progressArtworks([painter({ workProgress: 0 })], [atelier("5,5")], 3, 10, win);
  assert.equal(out.changed, true);
  assert.equal(out.artists[0]!.workProgress, 1);
  assert.equal(out.completed.length, 0);
  assert.equal(out.prestige, 0);
}

// A second artist speeds the work up with diminishing returns: +1.5/month.
{
  const crew = [painter({ workProgress: 0 }), painter({ id: "p2", homeTileKey: "5,5" })];
  const out = progressArtworks(crew, [atelier("5,5")], 3, 10, win);
  assert.equal(out.artists[0]!.workProgress, 1.5);
  assert.equal(out.artists[1]!.workProgress, undefined); // progress lives on the founder only
}

// Paused: inactive atelier or zero inspiration → identical output, same identity.
{
  const a = painter({ workProgress: 2 });
  const inactive = progressArtworks([a], [atelier("5,5", 2, false)], 3, 10, win);
  assert.equal(inactive.changed, false);
  assert.equal(inactive.artists[0], a);
  const uninspired = progressArtworks([a], [atelier("5,5")], 0, 10, win);
  assert.equal(uninspired.changed, false);
  assert.equal(uninspired.artists[0], a);
}

// Idle atelier untouched; stale workProgress on a non-founder is ignored.
{
  const a = painter();
  const out = progressArtworks([a], [atelier("5,5")], 3, 10, win);
  assert.equal(out.changed, false);
  assert.equal(out.artists[0], a);

  const stale = [painter(), painter({ id: "p2", homeTileKey: "5,5", workProgress: 3 })];
  const ignored = progressArtworks(stale, [atelier("5,5")], 3, 10, win);
  assert.equal(ignored.changed, false);
  assert.equal(ignored.artists[1], stale[1]);
}

// Completion mints an artwork credited to the founder; every member gains xp.
{
  const crew = [
    painter({ workProgress: WORK_DURATION_MONTHS.apprentice - 1 }),
    painter({ id: "p2", homeTileKey: "5,5" }),
  ];
  const out = progressArtworks(crew, [atelier("5,5")], 3, 42, win);
  assert.equal(out.completed.length, 1);
  assert.equal(out.completed[0]!.artistId, "p1");
  assert.equal(out.completed[0]!.artistType, "painter");
  assert.equal(out.completed[0]!.completedTick, 42);
  assert.ok(out.completed[0]!.name.length > 0);
  assert.equal(out.prestige, 1);
  assert.equal(out.artists[0]!.xp, 1);
  assert.equal(out.artists[0]!.workProgress, undefined);
  assert.equal(out.artists[1]!.xp, 1); // whole workshop learns
}

// Founder's rank sets duration and prestige, regardless of who else is there.
{
  const crew = [
    painter({ rank: "master", workProgress: WORK_DURATION_MONTHS.master - 1, xp: 9 }),
    painter({ id: "p2", homeTileKey: "5,5" }),
  ];
  const out = progressArtworks(crew, [atelier("5,5")], 3, 10, win);
  assert.equal(out.completed.length, 1);
  assert.equal(out.prestige, 4);
}

// Rank-ups at the xp thresholds; never demotes below current rank.
{
  const journeymanXp = RANK_XP.find((r) => r.rank === "journeyman")!.xp;
  const toJourneyman = progressArtworks(
    [painter({ workProgress: WORK_DURATION_MONTHS.apprentice - 1, xp: journeymanXp - 1 })],
    [atelier("5,5")], 3, 10, win
  );
  assert.equal(toJourneyman.artists[0]!.rank, "journeyman");

  const masterXp = RANK_XP.find((r) => r.rank === "master")!.xp;
  const toMaster = progressArtworks(
    [painter({ rank: "journeyman", workProgress: WORK_DURATION_MONTHS.journeyman - 1, xp: masterXp - 1 })],
    [atelier("5,5")], 3, 10, win
  );
  assert.equal(toMaster.artists[0]!.rank, "master");

  const lowXpMaster = progressArtworks(
    [painter({ rank: "master", workProgress: WORK_DURATION_MONTHS.master - 1, xp: 2 })],
    [atelier("5,5")], 3, 10, win
  );
  assert.equal(lowXpMaster.artists[0]!.rank, "master");
}

// Atelier with no artists at all → no progress, no crash.
{
  const out = progressArtworks([], [atelier("5,5")], 3, 10, win);
  assert.equal(out.changed, false);
  assert.equal(out.completed.length, 0);
}

console.log("artists.check: all assertions passed");
