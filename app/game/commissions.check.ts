// Self-check for commission offers, favor gating, and housekeeping.
// Run: node --experimental-strip-types app/game/commissions.check.ts
import assert from "node:assert";

import {
  canAssignCommission,
  favorFromWorks,
  favorOf,
  favorRung,
  favorTier,
  maybeOfferCommission,
  reconcileCommissions,
  requesterPool,
  BRONZE_COMMISSION_CHANCE,
  COMMISSION_OFFER_CHANCE,
  MAX_OPEN_OFFERS,
  OFFER_EXPIRY_MONTHS,
  REQUESTERS,
} from "./commissions.ts";
import {
  AFFRONTED_SKIP_CHANCE,
  COOLED_SKIP_CHANCE,
  FAVOR_GRANDEUR,
} from "./constants.ts";
import {
  ARTWORK_PRESTIGE,
  BRONZE_TITLES,
  CHURCH_TITLES,
  TITLES,
  WORK_DURATION_MONTHS,
} from "./artists.ts";
import { tile } from "./checkHelpers.ts";
import type { TileMap } from "./grid.ts";
import type { MaterialSupply } from "./materials.ts";
import type { Artist, Commission } from "./types.ts";

const painter = (extra: Partial<Artist> = {}): Artist => ({
  id: "p1",
  name: "x",
  type: "painter",
  rank: "apprentice",
  homeTileKey: "5,5",
  ...extra,
});

const sculptor = (extra: Partial<Artist> = {}): Artist => ({
  id: "s1",
  name: "x",
  type: "sculptor",
  rank: "apprentice",
  homeTileKey: "5,5",
  ...extra,
});

const offer = (extra: Partial<Commission> = {}): Commission => ({
  id: "c1",
  title: "Test Fresco",
  requester: "The Church",
  artistType: "painter",
  durationMonths: 4,
  florins: 50,
  prestige: 3,
  expiresTick: 999,
  ...extra,
});

const homeTile = (buildingId: Parameters<typeof tile>[0], active = true) =>
  tile(buildingId, 5, 5, { workers: 2, isActive: active });

const availableSupply: MaterialSupply = {
  capacity: 3,
  inUse: 0,
  allowed: new Set(),
};

// Assignment eligibility is shared by the UI and the authoritative store action.
{
  const commission = offer();
  const founder = painter();
  const tiles: TileMap = { "5,5": homeTile("workshop") };
  assert.equal(canAssignCommission(commission, founder, tiles, availableSupply), true);
  assert.equal(
    canAssignCommission({ ...commission, workshopKey: "5,5" }, founder, tiles, availableSupply),
    false
  );
  assert.equal(canAssignCommission(commission, undefined, tiles, availableSupply), false);
  assert.equal(
    canAssignCommission(commission, { ...founder, type: "sculptor" }, tiles, availableSupply),
    false
  );
  assert.equal(
    canAssignCommission(commission, { ...founder, workProgress: 0 }, tiles, availableSupply),
    false
  );
  assert.equal(canAssignCommission(commission, founder, {}, availableSupply), false);
  assert.equal(
    canAssignCommission(commission, founder, { "5,5": homeTile("workshop", false) }, availableSupply),
    false
  );
  assert.equal(
    canAssignCommission(commission, founder, { "5,5": homeTile("cottage") }, availableSupply),
    false
  );
  assert.equal(
    canAssignCommission(commission, founder, tiles, {
      capacity: 3,
      inUse: 3,
      allowed: new Set(),
    }),
    false
  );
}

// --- Requester pool: patron admission by standing buildings ---

const chapelTiles: TileMap = { "0,0": tile("chapel", 0, 0) };
const palazzoAt = (x: number) => tile("palazzo", x, 0);

{
  assert.deepEqual(requesterPool({}), []);
  assert.deepEqual(requesterPool(chapelTiles).map((r) => r.name), ["The Church"]);
  assert.deepEqual(
    requesterPool({ "0,0": tile("cathedral", 0, 0) }).map((r) => r.name),
    ["The Church"]
  );
  // Each palazzo installs the next house in table order; 4th has no one left.
  assert.deepEqual(requesterPool({ "0,0": palazzoAt(0) }).map((r) => r.name), ["House Medici"]);
  assert.deepEqual(
    requesterPool({ "0,0": palazzoAt(0), "8,0": palazzoAt(8) }).map((r) => r.name),
    ["House Medici", "House Strozzi"]
  );
  assert.deepEqual(
    requesterPool({
      ...chapelTiles,
      "8,0": palazzoAt(8),
      "16,0": palazzoAt(16),
      "24,0": palazzoAt(24),
      "32,0": palazzoAt(32),
    }).map((r) => r.name),
    ["The Church", "House Medici", "House Strozzi", "House Pazzi"]
  );
  // Non-origin cells don't admit anyone.
  assert.deepEqual(requesterPool({ "0,0": tile("chapel", 0, 0, { isOrigin: false }) }), []);
  // Guild requesters are gone.
  assert.equal(REQUESTERS.length, 4);
  assert.ok(REQUESTERS.every((r) => r.mix === "florins" || r.mix === "prestige"));
}

// --- Favor helpers ---

{
  assert.equal(favorOf({}, "The Church"), 50);
  assert.equal(favorOf({ "The Church": 80 }, "The Church"), 80);

  assert.equal(favorTier(50), "neutral");
  assert.equal(favorTier(35), "neutral");
  assert.equal(favorTier(34), "cooled");
  assert.equal(favorTier(15), "cooled");
  assert.equal(favorTier(14), "affronted");

  // Rungs by current level; nobles have no building gate.
  assert.equal(favorRung("House Medici", 59, {}), 0);
  assert.equal(favorRung("House Medici", 60, {}), 1);
  assert.equal(favorRung("House Medici", 75, {}), 2);
  assert.equal(favorRung("House Medici", 90, {}), 3);
  // The Church's rungs 2–3 need a standing cathedral; rung 1 doesn't.
  assert.equal(favorRung("The Church", 90, chapelTiles), 1);
  assert.equal(favorRung("The Church", 60, chapelTiles), 1);
  assert.equal(favorRung("The Church", 90, { "0,0": tile("cathedral", 0, 0) }), 3);

  // Save/demo seeding: +8 per work from 50, clamped at 100.
  assert.deepEqual(favorFromWorks([]), {});
  assert.deepEqual(
    favorFromWorks([
      { requester: "The Church" },
      { requester: "The Church" },
      { requester: "House Medici" },
      {},
    ]),
    { "The Church": 66, "House Medici": 58 }
  );
  assert.equal(favorFromWorks(Array(20).fill({ requester: "The Church" }))["The Church"], 100);
}

// rng that returns a fixed sequence, then 0s. First draw gates the offer.
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++] ?? 0;
};
const win = () => 0; // below COMMISSION_OFFER_CHANCE → offer; picks index 0 everywhere
const lose = () => COMMISSION_OFFER_CHANCE;
const explode = () => {
  throw new Error("rng drawn");
};

// Draw order in maybeOfferCommission: gate, type, [material — sculptor only],
// requester, [tier skip — cooled/affronted only], title. The material draw
// exists only for sculptors and the skip draw only below neutral favor, so a
// neutral painter stream keeps the historical (gate, type, requester, title).
const requesterDraw = (pool: { name: string }[], name: string) =>
  pool.findIndex((r) => r.name === name) / pool.length + 1e-9;

// Reward baselines (apprentice): FLORINS_PER_PRESTIGE=40, PRESTIGE_SCALE=1.5.
// Church: florins 40×2=80, prestige round(1.5/2)=1. Noble: 20 / 3.
const richTiles: TileMap = {
  ...chapelTiles,
  "8,0": palazzoAt(8),
  "16,0": palazzoAt(16),
  "24,0": palazzoAt(24),
};
const richPool = requesterPool(richTiles);

// Empty pool → null before any rng draw, even a winning one.
assert.equal(maybeOfferCommission([], [painter()], 10, explode, {}, {}), null);

// Winning roll with a painter → actionable painter offer, scaled to apprentice tables.
{
  const out = maybeOfferCommission([], [painter()], 10, win, chapelTiles, {});
  assert.ok(out);
  assert.equal(out.artistType, "painter");
  assert.equal(out.material, "pigment"); // painters take no extra draw
  assert.equal(out.requester, "The Church"); // the only admitted patron
  assert.ok(CHURCH_TITLES.painter.includes(out.title)); // church offers use devotional titles
  assert.equal(out.durationMonths, WORK_DURATION_MONTHS.apprentice);
  assert.equal(out.florins, 80); // 40 × skew 2
  assert.equal(out.prestige, 1); // round(1×1.5 / 2)
  assert.equal(out.expiresTick, 10 + OFFER_EXPIRY_MONTHS);
  assert.equal(out.workshopKey, undefined);
}

// Noble offers skew prestige and keep the secular title pool.
{
  const out = maybeOfferCommission(
    [],
    [painter()],
    10,
    seq(0, 0, requesterDraw(richPool, "House Medici"), 0),
    richTiles,
    {}
  );
  assert.equal(out?.requester, "House Medici");
  assert.ok(TITLES.painter.includes(out!.title));
  assert.equal(out?.florins, 20); // 40 / skew 2
  assert.equal(out?.prestige, 3); // 1 × 1.5 × 2
}

// Sculptor offers roll marble or bronze via the extra draw (< BRONZE_COMMISSION_CHANCE
// → bronze), and bronze picks from BRONZE_TITLES even for the Church.
{
  const bronze = maybeOfferCommission(
    [],
    [sculptor()],
    10,
    seq(0, 0, BRONZE_COMMISSION_CHANCE - 0.01, 0, 0),
    chapelTiles,
    {}
  );
  assert.equal(bronze?.artistType, "sculptor");
  assert.equal(bronze?.material, "bronze");
  assert.ok(BRONZE_TITLES.includes(bronze!.title));

  const marble = maybeOfferCommission(
    [],
    [sculptor()],
    10,
    seq(0, 0, BRONZE_COMMISSION_CHANCE + 0.01, 0, 0),
    chapelTiles,
    {}
  );
  assert.equal(marble?.material, "marble");
  assert.ok(CHURCH_TITLES.sculptor.includes(marble!.title));
}

// Gated off: no artists, losing roll, or open offers at the cap → null.
assert.equal(maybeOfferCommission([], [], 10, win, chapelTiles, {}), null);
assert.equal(maybeOfferCommission([], [painter()], 10, lose, chapelTiles, {}), null);
{
  const atCap = Array.from({ length: MAX_OPEN_OFFERS }, (_, i) => offer({ id: `c${i}` }));
  assert.equal(maybeOfferCommission(atCap, [painter()], 10, win, chapelTiles, {}), null);
}

// Active (assigned) commissions don't count toward the open-offer cap.
{
  const active = Array.from({ length: MAX_OPEN_OFFERS }, (_, i) =>
    offer({ id: `c${i}`, workshopKey: "5,5" })
  );
  assert.ok(maybeOfferCommission(active, [painter()], 10, win, chapelTiles, {}));
}

// The best rank among artists of the chosen type drives duration and reward.
{
  const artists = [painter(), painter({ id: "p2", rank: "master", homeTileKey: "6,6" })];
  const out = maybeOfferCommission([], artists, 10, win, chapelTiles, {});
  assert.equal(out?.durationMonths, WORK_DURATION_MONTHS.master);
  assert.equal(out?.prestige, 5); // round(6×1.5 / 2)
  assert.equal(out?.florins, 180); // 40×(1 + 5×0.25) × 2
}

// Commission florins are compressed against rank (prestige is not): a
// grand-master offer earns far less than the naive 10x florins scaling,
// while its prestige still runs the full rank curve.
{
  const artists = [painter({ rank: "grand_master" })];
  const out = maybeOfferCommission([], artists, 10, win, chapelTiles, {});
  assert.equal(out?.prestige, 8); // round(10×1.5 / 2) — full curve
  assert.equal(out?.florins, 260); // 40×(1 + 9×0.25) × 2
  assert.ok(out!.florins < ARTWORK_PRESTIGE.grand_master * 40 * 2); // well under the naive 10x
}

// Grandeur: favor rungs multiply duration, florins, and prestige.
{
  const favor = { "House Medici": 75 }; // rung 2 → ×1.6
  const out = maybeOfferCommission(
    [],
    [painter()],
    10,
    seq(0, 0, requesterDraw(richPool, "House Medici"), 0),
    richTiles,
    favor
  );
  assert.equal(FAVOR_GRANDEUR[2], 1.6);
  assert.equal(out?.durationMonths, Math.round(WORK_DURATION_MONTHS.apprentice * 1.6));
  assert.equal(out?.florins, 32); // 20 × 1.6
  assert.equal(out?.prestige, 5); // round(3 × 1.6)
}

// The Church's upper rungs wait on a cathedral: favor 90 in a chapel-only city
// still offers at rung 1 grandeur.
{
  const out = maybeOfferCommission([], [painter()], 10, win, chapelTiles, { "The Church": 90 });
  assert.equal(out?.florins, Math.round(80 * FAVOR_GRANDEUR[1]!)); // 104, not ×2
}

// Cooled (favor < 35): an extra skip draw after the requester pick — below the
// chance skips, above it offers, forced to rung 0.
{
  const favor = { "The Church": 30 };
  const skipped = maybeOfferCommission(
    [],
    [painter()],
    10,
    seq(0, 0, 0, COOLED_SKIP_CHANCE - 0.01),
    chapelTiles,
    favor
  );
  assert.equal(skipped, null);

  const offered = maybeOfferCommission(
    [],
    [painter()],
    10,
    seq(0, 0, 0, COOLED_SKIP_CHANCE, 0),
    chapelTiles,
    favor
  );
  assert.equal(offered?.florins, 80); // rung 0 — no grandeur despite any thresholds
  assert.equal(offered?.prestige, 1);
}

// Affronted (favor < 15): near-silence at the higher skip chance; the rare
// offer that lands is the recovery path, at rung 0.
{
  const favor = { "The Church": 10 };
  assert.equal(
    maybeOfferCommission(
      [],
      [painter()],
      10,
      seq(0, 0, 0, AFFRONTED_SKIP_CHANCE - 0.01),
      chapelTiles,
      favor
    ),
    null
  );
  const offered = maybeOfferCommission(
    [],
    [painter()],
    10,
    seq(0, 0, 0, AFFRONTED_SKIP_CHANCE, 0),
    chapelTiles,
    favor
  );
  assert.equal(offered?.florins, 80);
}

// --- reconcileCommissions ---

// Expired open offer dropped (its requester reported for the favor slight);
// unexpired kept.
{
  const stale = offer({ id: "old", expiresTick: 10, requester: "House Pazzi" });
  const fresh = offer({ id: "new", expiresTick: 20 });
  const out = reconcileCommissions([stale, fresh], new Set(), 10);
  assert.equal(out.changed, true);
  assert.deepEqual(out.commissions.map((c) => c.id), ["new"]);
  assert.deepEqual(out.expiredRequesters, ["House Pazzi"]);
}

// Active commission ignores expiry while its workshop stands.
{
  const active = offer({ workshopKey: "5,5", expiresTick: 0 });
  const out = reconcileCommissions([active], new Set(["5,5"]), 50);
  assert.equal(out.changed, false);
  assert.equal(out.commissions[0], active);
  assert.deepEqual(out.expiredRequesters, []);
}

// Demolished workshop → commission reverts to an open offer with a fresh
// expiry — no slight for that.
{
  const orphan = offer({ workshopKey: "5,5", expiresTick: 0 });
  const out = reconcileCommissions([orphan], new Set(), 50);
  assert.equal(out.changed, true);
  assert.equal(out.commissions[0]!.workshopKey, undefined);
  assert.equal(out.commissions[0]!.expiresTick, 50 + OFFER_EXPIRY_MONTHS);
  assert.deepEqual(out.expiredRequesters, []);
}

// No-op keeps array identity.
{
  const input = [offer()];
  const out = reconcileCommissions(input, new Set(), 10);
  assert.equal(out.changed, false);
  assert.equal(out.commissions, input);
}

console.log("commissions.check: all assertions passed");
