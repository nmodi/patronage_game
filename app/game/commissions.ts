import type { Artist, ArtistRank, Commission } from "./types.ts";
import { ARTWORK_PRESTIGE, pick, RANK_ORDER, TITLES, WORK_DURATION_MONTHS } from "./artists.ts";

// No other runtime imports: commissions.check.ts runs this file under plain
// Node (type-only imports are stripped), mirroring artists.ts.

export const COMMISSION_OFFER_CHANCE = 0.15; // per month, when under the cap
export const MAX_OPEN_OFFERS = 3;
export const OFFER_EXPIRY_MONTHS = 12;

// ponytail: requesters are flavor strings on system-generated offers — a
// faction system (and unlock buildings like Cathedral/Guildhall gating types)
// takes over offer generation later.
type RewardMix = "florins" | "prestige" | "mixed";
export const REQUESTERS: { name: string; mix: RewardMix }[] = [
  { name: "The Church", mix: "florins" },
  { name: "House Medici", mix: "prestige" },
  { name: "House Strozzi", mix: "prestige" },
  { name: "House Pazzi", mix: "prestige" },
  { name: "The Wool Guild", mix: "mixed" },
  { name: "The Silk Guild", mix: "mixed" },
];

/**
 * Periodic commission offer (design doc, Phase 8), mirroring maybeArriveArtist.
 * Each month, if open offers are under the cap, there's a chance one arrives.
 * The type is drawn from artist types present in the city (so every offer is
 * actionable) and the best rank of that type scales duration and reward; the
 * requester skews the florin/prestige split. Returns null when nothing is
 * offered. rng is injectable for the self-test.
 */
export function maybeOfferCommission(
  commissions: Commission[],
  artists: Artist[],
  currentTick: number,
  rng: () => number = Math.random
): Commission | null {
  const open = commissions.filter((c) => !c.workshopKey);
  if (open.length >= MAX_OPEN_OFFERS) return null;

  const types = [...new Set(artists.map((a) => a.type))].sort();
  if (types.length === 0) return null;
  if (rng() >= COMMISSION_OFFER_CHANCE) return null;

  const type = pick(types, rng);
  const bestRank = artists
    .filter((a) => a.type === type)
    .reduce<ArtistRank>(
      (best, a) => (RANK_ORDER[a.rank] > RANK_ORDER[best] ? a.rank : best),
      "apprentice"
    );
  const requester = pick(REQUESTERS, rng);
  const basePrestige = ARTWORK_PRESTIGE[bestRank];
  const baseFlorins = 25 * basePrestige;

  let florins = baseFlorins;
  let prestige = basePrestige;
  if (requester.mix === "florins") {
    florins = baseFlorins * 2;
    prestige = Math.max(1, Math.round(basePrestige / 2));
  } else if (requester.mix === "prestige") {
    florins = Math.round(baseFlorins / 2);
    prestige = basePrestige * 2;
  }

  return {
    id: crypto.randomUUID(),
    title: pick(TITLES[type], rng),
    requester: requester.name,
    artistType: type,
    durationMonths: WORK_DURATION_MONTHS[bestRank],
    florins,
    prestige,
    expiresTick: currentTick + OFFER_EXPIRY_MONTHS,
  };
}

/**
 * Housekeeping before offers/progress each tick: active commissions whose
 * workshop vanished revert to open offers (with a fresh expiry, so "reverted"
 * doesn't mean "instantly expired"), and open offers past their expiry are
 * dropped. Pure; returns the same array identity when nothing changed.
 */
export function reconcileCommissions(
  commissions: Commission[],
  workshopKeys: Set<string>,
  currentTick: number
): { commissions: Commission[]; changed: boolean } {
  let changed = false;
  const next: Commission[] = [];
  for (const c of commissions) {
    if (c.workshopKey && !workshopKeys.has(c.workshopKey)) {
      next.push({ ...c, workshopKey: undefined, expiresTick: currentTick + OFFER_EXPIRY_MONTHS });
      changed = true;
      continue;
    }
    if (!c.workshopKey && currentTick >= c.expiresTick) {
      changed = true;
      continue;
    }
    next.push(c);
  }
  return changed ? { commissions: next, changed } : { commissions, changed };
}
