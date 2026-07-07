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
  type WorkshopSlot,
} from "./artists.ts";
import type { Artist, Commission } from "./types.ts";

const readyTick = ARTIST_ARRIVAL_COOLDOWN_MONTHS;
const workshop = (key: string, capacity = 2, isActive = true, builtTick = 0): WorkshopSlot => ({
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

// Winning roll binds an apprentice to the (only) workshop.
{
  const out = maybeArriveArtist([workshop("5,5")], [], 3, readyTick, win);
  assert.ok(out);
  assert.equal(out.homeTileKey, "5,5");
  assert.equal(out.rank, "apprentice");
  assert.ok(out.type === "painter" || out.type === "sculptor");
}

// Gated off: no inspiration, inactive workshop, losing roll → null.
assert.equal(maybeArriveArtist([workshop("5,5")], [], 0, readyTick, win), null);
assert.equal(maybeArriveArtist([workshop("5,5", 2, false)], [], 3, readyTick, win), null);
assert.equal(maybeArriveArtist([workshop("5,5")], [], 3, readyTick, lose), null);

// Newly built workshops wait a short cooldown before artists can arrive.
assert.equal(
  maybeArriveArtist([workshop("5,5", 2, true, readyTick)], [], 3, readyTick, win),
  null
);
assert.ok(maybeArriveArtist([workshop("5,5", 2, true, 0)], [], 3, readyTick, win));

// Full workshop → null even on a winning roll.
{
  const full: Artist[] = [
    { id: "a", name: "x", type: "painter", rank: "apprentice", homeTileKey: "5,5" },
    { id: "b", name: "y", type: "sculptor", rank: "apprentice", homeTileKey: "5,5" },
  ];
  assert.equal(maybeArriveArtist([workshop("5,5", 2)], full, 3, readyTick, win), null);
}

// Two open workshops → first by key sort wins, regardless of input order.
{
  const out = maybeArriveArtist([workshop("9,1"), workshop("2,8")], [], 3, readyTick, win);
  assert.equal(out?.homeTileKey, "2,8");
}

// A full workshop is skipped so a second open one still receives the artist.
{
  const one: Artist[] = [{ id: "a", name: "x", type: "painter", rank: "apprentice", homeTileKey: "2,8" }];
  const out = maybeArriveArtist([workshop("2,8", 1), workshop("9,1")], one, 3, readyTick, seq(0, 0, 0));
  assert.equal(out?.homeTileKey, "9,1");
}

// --- createArtist (founders spawn with the workshop) ---
{
  const a = createArtist("7,3", win);
  assert.equal(a.homeTileKey, "7,3");
  assert.equal(a.rank, "apprentice");
  assert.ok(a.type === "painter" || a.type === "sculptor");
  assert.ok(a.name.length > 0);
}

// --- progressArtworks (Phase 6 progress, Phase 8 commission-driven) ---

const painter = (extra: Partial<Artist> = {}): Artist => ({
  id: "p1",
  name: "x",
  type: "painter",
  rank: "apprentice",
  homeTileKey: "5,5",
  ...extra,
});

// Assigned commission fixture: 4 months, pays 50 florins + 3 prestige.
const commission = (workshopKey: string, extra: Partial<Commission> = {}): Commission => ({
  id: `c-${workshopKey}`,
  title: "Test Fresco",
  requester: "The Church",
  artistType: "painter",
  durationMonths: 4,
  florins: 50,
  prestige: 3,
  expiresTick: 999,
  workshopKey,
  ...extra,
});

// Solo founder at an active workshop advances one month.
{
  const out = progressArtworks([painter({ workProgress: 0 })], [workshop("5,5")], [commission("5,5")], 3, 10);
  assert.equal(out.changed, true);
  assert.equal(out.artists[0]!.workProgress, 1);
  assert.equal(out.completed.length, 0);
  assert.equal(out.prestige, 0);
  assert.equal(out.florins, 0);
}

// A second artist speeds the work up with diminishing returns: +1.5/month.
{
  const crew = [painter({ workProgress: 0 }), painter({ id: "p2", homeTileKey: "5,5" })];
  const out = progressArtworks(crew, [workshop("5,5")], [commission("5,5")], 3, 10);
  assert.equal(out.artists[0]!.workProgress, 1.5);
  assert.equal(out.artists[1]!.workProgress, undefined); // progress lives on the founder only
}

// Paused: inactive workshop or zero inspiration → identical output, same identity.
{
  const a = painter({ workProgress: 2 });
  const inactive = progressArtworks([a], [workshop("5,5", 2, false)], [commission("5,5")], 3, 10);
  assert.equal(inactive.changed, false);
  assert.equal(inactive.artists[0], a);
  const uninspired = progressArtworks([a], [workshop("5,5")], [commission("5,5")], 0, 10);
  assert.equal(uninspired.changed, false);
  assert.equal(uninspired.artists[0], a);
}

// Idle workshop untouched; stale workProgress on a non-founder is ignored.
{
  const a = painter();
  const out = progressArtworks([a], [workshop("5,5")], [commission("5,5")], 3, 10);
  assert.equal(out.changed, false);
  assert.equal(out.artists[0], a);

  const stale = [painter(), painter({ id: "p2", homeTileKey: "5,5", workProgress: 3 })];
  const ignored = progressArtworks(stale, [workshop("5,5")], [commission("5,5")], 3, 10);
  assert.equal(ignored.changed, false);
  assert.equal(ignored.artists[1], stale[1]);
}

// Founder with workProgress but no commission behind it → skipped, no crash.
{
  const a = painter({ workProgress: 2 });
  const out = progressArtworks([a], [workshop("5,5")], [], 3, 10);
  assert.equal(out.changed, false);
  assert.equal(out.artists[0], a);
}

// An open offer (no workshopKey) drives nothing.
{
  const a = painter({ workProgress: 2 });
  const out = progressArtworks([a], [workshop("5,5")], [commission("5,5", { workshopKey: undefined })], 3, 10);
  assert.equal(out.changed, false);
}

// Completion mints the commissioned artwork and pays its reward; every member gains xp.
{
  const crew = [
    painter({ workProgress: 3 }), // one tick from the 4-month duration
    painter({ id: "p2", homeTileKey: "5,5" }),
  ];
  const out = progressArtworks(crew, [workshop("5,5")], [commission("5,5")], 3, 42);
  assert.equal(out.completed.length, 1);
  assert.equal(out.completed[0]!.artistId, "p1");
  assert.equal(out.completed[0]!.artistType, "painter");
  assert.equal(out.completed[0]!.completedTick, 42);
  assert.equal(out.completed[0]!.name, "Test Fresco");
  assert.equal(out.completed[0]!.requester, "The Church");
  assert.deepEqual(out.finishedCommissionIds, ["c-5,5"]);
  assert.equal(out.prestige, 3);
  assert.equal(out.florins, 50);
  assert.equal(out.artists[0]!.xp, 1);
  assert.equal(out.artists[0]!.workProgress, undefined);
  assert.equal(out.artists[1]!.xp, 1); // whole workshop learns
}

// The commission sets duration and payout, not the founder's rank.
{
  const crew = [painter({ rank: "master", workProgress: 7, xp: 9 })];
  const out = progressArtworks(crew, [workshop("5,5")], [commission("5,5", { durationMonths: 8, florins: 200, prestige: 12 })], 3, 10);
  assert.equal(out.completed.length, 1);
  assert.equal(out.prestige, 12);
  assert.equal(out.florins, 200);
}

// Rank-ups at the xp thresholds; never demotes below current rank.
{
  const done = { workProgress: 3 }; // completes the 4-month fixture
  const journeymanXp = RANK_XP.find((r) => r.rank === "journeyman")!.xp;
  const toJourneyman = progressArtworks(
    [painter({ ...done, xp: journeymanXp - 1 })],
    [workshop("5,5")], [commission("5,5")], 3, 10
  );
  assert.equal(toJourneyman.artists[0]!.rank, "journeyman");

  const masterXp = RANK_XP.find((r) => r.rank === "master")!.xp;
  const toMaster = progressArtworks(
    [painter({ rank: "journeyman", ...done, xp: masterXp - 1 })],
    [workshop("5,5")], [commission("5,5")], 3, 10
  );
  assert.equal(toMaster.artists[0]!.rank, "master");

  const lowXpMaster = progressArtworks(
    [painter({ rank: "master", ...done, xp: 2 })],
    [workshop("5,5")], [commission("5,5")], 3, 10
  );
  assert.equal(lowXpMaster.artists[0]!.rank, "master");

  const grandXp = RANK_XP.find((r) => r.rank === "grand_master")!.xp;
  const toGrand = progressArtworks(
    [painter({ rank: "renowned_master", ...done, xp: grandXp - 1 })],
    [workshop("5,5")], [commission("5,5")], 3, 10
  );
  assert.equal(toGrand.artists[0]!.rank, "grand_master");
}

// Workshop with no artists at all → no progress, no crash.
{
  const out = progressArtworks([], [workshop("5,5")], [commission("5,5")], 3, 10);
  assert.equal(out.changed, false);
  assert.equal(out.completed.length, 0);
}

console.log("artists.check: all assertions passed");
