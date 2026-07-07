// Self-check for commission offers and housekeeping.
// Run: node --experimental-strip-types app/game/commissions.check.ts
import assert from "node:assert";

import {
  maybeOfferCommission,
  reconcileCommissions,
  COMMISSION_OFFER_CHANCE,
  MAX_OPEN_OFFERS,
  OFFER_EXPIRY_MONTHS,
  REQUESTERS,
} from "./commissions.ts";
import { ARTWORK_PRESTIGE, WORK_DURATION_MONTHS } from "./artists.ts";
import type { Artist, Commission } from "./types.ts";

const painter = (extra: Partial<Artist> = {}): Artist => ({
  id: "p1",
  name: "x",
  type: "painter",
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

// rng that returns a fixed sequence, then 0s. First draw gates the offer.
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++] ?? 0;
};
const win = () => 0; // below COMMISSION_OFFER_CHANCE → offer; picks index 0 everywhere
const lose = () => COMMISSION_OFFER_CHANCE;

// Requester index for forcing a specific reward mix via the rng sequence.
// Draw order in maybeOfferCommission: gate, type, requester, title.
const requesterDraw = (i: number) => i / REQUESTERS.length + 1e-9;
const churchIdx = REQUESTERS.findIndex((r) => r.mix === "florins");
const nobleIdx = REQUESTERS.findIndex((r) => r.mix === "prestige");
const guildIdx = REQUESTERS.findIndex((r) => r.mix === "mixed");

// Winning roll with a painter → actionable painter offer, scaled to apprentice tables.
{
  const out = maybeOfferCommission([], [painter()], 10, seq(0, 0, requesterDraw(guildIdx), 0));
  assert.ok(out);
  assert.equal(out.artistType, "painter");
  assert.ok(REQUESTERS.some((r) => r.name === out.requester));
  assert.ok(out.title.length > 0);
  assert.equal(out.durationMonths, WORK_DURATION_MONTHS.apprentice);
  assert.equal(out.prestige, ARTWORK_PRESTIGE.apprentice);
  assert.equal(out.florins, 25 * ARTWORK_PRESTIGE.apprentice);
  assert.equal(out.expiresTick, 10 + OFFER_EXPIRY_MONTHS);
  assert.equal(out.workshopKey, undefined);
}

// Gated off: no artists, losing roll, or open offers at the cap → null.
assert.equal(maybeOfferCommission([], [], 10, win), null);
assert.equal(maybeOfferCommission([], [painter()], 10, lose), null);
{
  const atCap = Array.from({ length: MAX_OPEN_OFFERS }, (_, i) => offer({ id: `c${i}` }));
  assert.equal(maybeOfferCommission(atCap, [painter()], 10, win), null);
}

// Active (assigned) commissions don't count toward the open-offer cap.
{
  const active = Array.from({ length: MAX_OPEN_OFFERS }, (_, i) =>
    offer({ id: `c${i}`, workshopKey: "5,5" })
  );
  assert.ok(maybeOfferCommission(active, [painter()], 10, win));
}

// The best rank among artists of the chosen type drives duration and reward.
{
  const artists = [painter(), painter({ id: "p2", rank: "master", homeTileKey: "6,6" })];
  const out = maybeOfferCommission([], artists, 10, seq(0, 0, requesterDraw(guildIdx), 0));
  assert.equal(out?.durationMonths, WORK_DURATION_MONTHS.master);
  assert.equal(out?.prestige, ARTWORK_PRESTIGE.master);
}

// Reward mix: Church skews florins, nobles skew prestige, guilds stay at base.
{
  const base = ARTWORK_PRESTIGE.apprentice;
  const church = maybeOfferCommission([], [painter()], 10, seq(0, 0, requesterDraw(churchIdx), 0));
  assert.equal(church?.florins, 25 * base * 2);
  assert.equal(church?.prestige, Math.max(1, Math.round(base / 2)));

  const noble = maybeOfferCommission([], [painter()], 10, seq(0, 0, requesterDraw(nobleIdx), 0));
  assert.equal(noble?.florins, Math.round((25 * base) / 2));
  assert.equal(noble?.prestige, base * 2);
}

// --- reconcileCommissions ---

// Expired open offer dropped; unexpired kept.
{
  const stale = offer({ id: "old", expiresTick: 10 });
  const fresh = offer({ id: "new", expiresTick: 20 });
  const out = reconcileCommissions([stale, fresh], new Set(), 10);
  assert.equal(out.changed, true);
  assert.deepEqual(out.commissions.map((c) => c.id), ["new"]);
}

// Active commission ignores expiry while its workshop stands.
{
  const active = offer({ workshopKey: "5,5", expiresTick: 0 });
  const out = reconcileCommissions([active], new Set(["5,5"]), 50);
  assert.equal(out.changed, false);
  assert.equal(out.commissions[0], active);
}

// Demolished workshop → commission reverts to an open offer with a fresh expiry.
{
  const orphan = offer({ workshopKey: "5,5", expiresTick: 0 });
  const out = reconcileCommissions([orphan], new Set(), 50);
  assert.equal(out.changed, true);
  assert.equal(out.commissions[0]!.workshopKey, undefined);
  assert.equal(out.commissions[0]!.expiresTick, 50 + OFFER_EXPIRY_MONTHS);
}

// No-op keeps array identity.
{
  const input = [offer()];
  const out = reconcileCommissions(input, new Set(), 10);
  assert.equal(out.changed, false);
  assert.equal(out.commissions, input);
}

console.log("commissions.check: all assertions passed");
