// Self-check for passive artist arrival.
// Run: node --experimental-strip-types app/game/artists.check.ts
import assert from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ART_IMAGES, STATUE_MODELS } from "./artImages.ts";
import { CHURCH_TITLES, TITLES } from "./artists.ts";
import {
  accrueDisciplineXp,
  applyXpFloor,
  createArtist,
  maybeArriveArtist,
  pickGraduate,
  progressArtworks,
  xpFloor,
  ARTIST_ARRIVAL_CHANCE,
  ARTIST_ARRIVAL_COOLDOWN_MONTHS,
  RANK_XP,
  XP_RATES,
  type DisciplineXp,
  type WorkshopSlot,
} from "./artists.ts";
import { FLOOR_FRACTION, POOL_PER_PRESTIGE } from "../constants.ts";
import type { Artist, ArtistType, Artwork, Commission } from "../types.ts";

const readyTick = ARTIST_ARRIVAL_COOLDOWN_MONTHS;
const workshop = (
  key: string,
  capacity = 2,
  isActive = true,
  builtTick = 0,
  artistType: ArtistType = "painter"
): WorkshopSlot => ({
  key,
  capacity,
  artistType,
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

// Winning roll binds an apprentice of the workshop's type to the (only) workshop.
{
  const out = maybeArriveArtist([workshop("5,5")], [], 3, readyTick, win);
  assert.ok(out);
  assert.equal(out.homeTileKey, "5,5");
  assert.equal(out.rank, "apprentice");
  assert.equal(out.type, "painter");
  const sculptor = maybeArriveArtist([workshop("5,5", 2, true, 0, "sculptor")], [], 3, readyTick, win);
  assert.equal(sculptor?.type, "sculptor");
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

// --- createArtist (founders spawn with the workshop, typed by it) ---
{
  const a = createArtist("7,3", "sculptor", win);
  assert.equal(a.homeTileKey, "7,3");
  assert.equal(a.rank, "apprentice");
  assert.equal(a.type, "sculptor");
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

// Plaza connection speeds work by strength — 25% at full, 10% at 0.4 (Phase 10).
{
  const out = progressArtworks(
    [painter({ workProgress: 0 })],
    [workshop("5,5")],
    [commission("5,5")],
    3,
    10,
    new Map([["5,5", 1]])
  );
  assert.equal(out.artists[0]!.workProgress, 1.25);
  const partial = progressArtworks(
    [painter({ workProgress: 0 })],
    [workshop("5,5")],
    [commission("5,5")],
    3,
    10,
    new Map([["5,5", 0.4]])
  );
  assert.equal(partial.artists[0]!.workProgress, 1.1);
  const other = progressArtworks(
    [painter({ workProgress: 0 })],
    [workshop("5,5")],
    [commission("5,5")],
    3,
    10,
    new Map([["9,9", 1]])
  );
  assert.equal(other.artists[0]!.workProgress, 1);
}

// Displayed works in the workshop speed it up too (+5% each), stacking with plaza.
{
  const withDisplay = progressArtworks(
    [painter({ workProgress: 0 })],
    [workshop("5,5")],
    [commission("5,5")],
    3,
    10,
    undefined,
    new Map([["5,5", 2]])
  );
  assert.ok(Math.abs(withDisplay.artists[0]!.workProgress! - 1.1) < 1e-9);
  const stacked = progressArtworks(
    [painter({ workProgress: 0 })],
    [workshop("5,5")],
    [commission("5,5")],
    3,
    10,
    new Map([["5,5", 1]]),
    new Map([["5,5", 2]])
  );
  assert.ok(Math.abs(stacked.artists[0]!.workProgress! - 1.25 * 1.1) < 1e-9);
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

// Completions are the only personal XP now: an idle active workshop mutates
// nothing (identity), and stale non-founder workProgress is left untouched.
{
  const a = painter();
  const out = progressArtworks([a], [workshop("5,5")], [commission("5,5")], 3, 10);
  assert.equal(out.changed, false);
  assert.equal(out.artists[0], a);

  const stale = [painter(), painter({ id: "p2", homeTileKey: "5,5", workProgress: 3 })];
  const ignored = progressArtworks(stale, [workshop("5,5")], [commission("5,5")], 3, 10);
  assert.equal(ignored.changed, false);
  assert.equal(ignored.artists[1], stale[1]); // stale progress untouched
}

// Founder with workProgress but no commission behind it → progress skipped,
// identity kept, no crash.
{
  const a = painter({ workProgress: 2 });
  const out = progressArtworks([a], [workshop("5,5")], [], 3, 10);
  assert.equal(out.changed, false);
  assert.equal(out.artists[0], a);
}

// An open offer (no workshopKey) drives no progress either.
{
  const a = painter({ workProgress: 2 });
  const out = progressArtworks([a], [workshop("5,5")], [commission("5,5", { workshopKey: undefined })], 3, 10);
  assert.equal(out.changed, false);
  assert.equal(out.artists[0], a);
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
  assert.equal(out.completed[0]!.prestige, 3); // commission prestige captured for display quality
  assert.equal(out.completed[0]!.material, undefined); // no material on the commission → legacy default
  assert.deepEqual(out.finishedCommissionIds, ["c-5,5"]);
  assert.equal(out.prestige, 3);
  assert.equal(out.florins, 50);
  assert.equal(out.artists[0]!.xp, XP_RATES.perCompletedWork);
  assert.equal(out.artists[0]!.workProgress, undefined);
  assert.equal(out.artists[1]!.xp, XP_RATES.perCompletedWork); // whole workshop learns
}

// A bronze commission's material is copied onto the minted artwork (for the
// statue's render treatment); the copy is type-agnostic.
{
  const out = progressArtworks(
    [painter({ workProgress: 3 })],
    [workshop("5,5")],
    [commission("5,5", { material: "bronze" })],
    3,
    10
  );
  assert.equal(out.completed.length, 1);
  assert.equal(out.completed[0]!.material, "bronze");
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

// --- City discipline pools: accrual, floor, graduation ---

const pools = (extra: Partial<DisciplineXp> = {}): DisciplineXp => ({
  painter: 0,
  sculptor: 0,
  architect: 0,
  ...extra,
});

// accrueDisciplineXp banks 100 + 10×prestige per work into its own discipline;
// identity on empty, pure on input.
{
  const empty = pools();
  assert.equal(accrueDisciplineXp(empty, []), empty);
  const work = (artistType: ArtistType, prestige: number): Artwork => ({
    id: "w", name: "W", artistId: "p1", artistType, completedTick: 0, prestige,
  });
  const fed = accrueDisciplineXp(empty, [work("painter", 3), work("sculptor", 12)]);
  assert.equal(fed.painter, XP_RATES.perCompletedWork + POOL_PER_PRESTIGE * 3);
  assert.equal(fed.sculptor, XP_RATES.perCompletedWork + POOL_PER_PRESTIGE * 12);
  assert.equal(fed.architect, 0);
  assert.equal(empty.painter, 0); // input untouched
}

// applyXpFloor lifts below-floor artists (rank re-derived), never demotes,
// keeps identity when no one moves.
{
  const deep = pools({ painter: 2000 }); // floor 500 → journeyman (400)
  const low = painter({ xp: 10 });
  const sculptor = painter({ id: "s1", type: "sculptor" });
  const out = applyXpFloor([low, sculptor], deep);
  assert.equal(out[0]!.xp, xpFloor(deep, "painter"));
  assert.equal(out[0]!.xp, FLOOR_FRACTION * 2000);
  assert.equal(out[0]!.rank, "journeyman");
  assert.equal(out[1], sculptor); // empty sculptor pool: untouched, same identity

  const master = painter({ rank: "master", xp: 2400 });
  const same = [master];
  assert.equal(applyXpFloor(same, deep), same); // above the floor: array identity

  // A rank held above the derived floor rank is never demoted.
  const keptRank = applyXpFloor([painter({ rank: "master", xp: 10 })], deep);
  assert.equal(keptRank[0]!.rank, "master");
  assert.equal(keptRank[0]!.xp, 500);
}

// pickGraduate: highest-xp non-founder of the discipline; founders never
// graduate; ties keep the earlier artist; null when there's no bench.
{
  const founder = painter({ xp: 5000 }); // first at 5,5 — excluded despite top xp
  const benchLow = painter({ id: "p2", xp: 300 });
  const benchHigh = painter({ id: "p3", xp: 700 });
  const benchTie = painter({ id: "p4", xp: 700 });
  assert.equal(pickGraduate([founder, benchLow, benchHigh, benchTie], "painter"), benchHigh);
  assert.equal(pickGraduate([founder], "painter"), null);
  assert.equal(pickGraduate([founder, benchLow], "sculptor"), null); // wrong discipline
}

// Founders and arrivals spawn at the tradition floor, rank derived.
{
  const a = createArtist("7,3", "painter", win, 950);
  assert.equal(a.xp, 950);
  assert.equal(a.rank, "artisan"); // 900 threshold

  const deep = pools({ painter: 4000 }); // floor 1000
  const arrived = maybeArriveArtist([workshop("5,5")], [], 3, readyTick, win, deep);
  assert.equal(arrived?.xp, 1000);
  assert.equal(arrived?.rank, "artisan");

  // No pools passed (legacy callers) → plain apprentice.
  const plain = maybeArriveArtist([workshop("5,5")], [], 3, readyTick, win);
  assert.equal(plain?.rank, "apprentice");
  assert.equal(plain?.xp, undefined);
}

// Every sculpture title is a real work with a real scan on disk, and the map
// carries no orphans — the two halves live in different files and drift.
{
  const titles = [...TITLES.sculptor, ...CHURCH_TITLES.sculptor];
  for (const title of titles) {
    const url = STATUE_MODELS[title];
    assert.ok(url, `no statue scan mapped for "${title}"`);
    assert.ok(existsSync(join("public", url!)), `missing ${url} for "${title}"`);
  }
  for (const title of Object.keys(STATUE_MODELS)) {
    assert.ok(titles.includes(title), `STATUE_MODELS maps a retired title: "${title}"`);
  }
}

// Same for paintings: every painter title is a real work with a pixel-art
// source on disk (scripts/make-pixel-art.py), and no orphaned entries.
{
  const titles = [...TITLES.painter, ...CHURCH_TITLES.painter];
  for (const title of titles) {
    const url = ART_IMAGES[title];
    assert.ok(url, `no painting source mapped for "${title}"`);
    assert.ok(existsSync(join("public", url!)), `missing ${url} for "${title}"`);
  }
  for (const title of Object.keys(ART_IMAGES)) {
    assert.ok(titles.includes(title), `ART_IMAGES maps a retired title: "${title}"`);
  }
}

// Titles are the asset key, so a title may never repeat across the pools —
// a collision would silently give two works one image.
{
  const all = Object.values(TITLES).flat().concat(Object.values(CHURCH_TITLES).flat());
  assert.equal(new Set(all).size, all.length, "duplicate title across the pools");
}

console.log("artists.check: all assertions passed");
