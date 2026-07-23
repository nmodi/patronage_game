import { BUILDING_METADATA_BY_ID } from "./buildings.ts";
import {
  AFFRONTED_SKIP_CHANCE,
  BRONZE_COMMISSION_CHANCE,
  COMMISSION_OFFER_CHANCE,
  COMMISSION_PRESTIGE_SCALE,
  COOLED_SKIP_CHANCE,
  FAVOR_AFFRONTED,
  FAVOR_COOLED,
  FAVOR_GRANDEUR,
  FAVOR_PER_WORK,
  FAVOR_RUNGS,
  FAVOR_START,
  FLORIN_RANK_COMPRESSION,
  FLORINS_PER_PRESTIGE,
  MAX_OPEN_OFFERS,
  OFFER_EXPIRY_MONTHS,
  REQUESTER_REWARD_SKEW,
} from "./constants.ts";
import type { TileMap } from "./grid.ts";
import { MATERIAL_BY_ARTIST_TYPE, type MaterialSupply } from "./materials.ts";
import type { Artist, ArtistRank, Commission } from "./types.ts";
import {
  ARTWORK_PRESTIGE,
  BRONZE_TITLES,
  CHURCH_TITLES,
  pick,
  RANK_ORDER,
  TITLES,
  WORK_DURATION_MONTHS,
} from "./artists.ts";

// Runtime dependencies stay inside the game layer so the self-check remains
// executable without React, Zustand, or Babylon.

export {
  BRONZE_COMMISSION_CHANCE,
  COMMISSION_OFFER_CHANCE,
  MAX_OPEN_OFFERS,
  OFFER_EXPIRY_MONTHS,
} from "./constants.ts";

/** Return an assigned commission to the open pool with a fresh expiry. */
export function reopenCommission(commission: Commission, currentTick: number): Commission {
  return {
    ...commission,
    workshopKey: undefined,
    expiresTick: currentTick + OFFER_EXPIRY_MONTHS,
  };
}

// Factions slice 1: the Church + the noble houses, admitted by buildings
// (requesterPool) and carrying a 0–100 favor meter. Houses install in table
// order per Palazzo; a seed-shuffled order is a future slice.
type RewardMix = "florins" | "prestige";
export const CHURCH = "The Church";
export const REQUESTERS: { name: string; mix: RewardMix }[] = [
  { name: CHURCH, mix: "florins" },
  { name: "House Medici", mix: "prestige" },
  { name: "House Strozzi", mix: "prestige" },
  { name: "House Pazzi", mix: "prestige" },
];

/**
 * Patrons admitted by standing buildings: a Chapel or Cathedral seats the
 * Church, each Palazzo installs the next noble house in table order. Empty
 * until the first of those goes up — no offers flow before then.
 */
export function requesterPool(tiles: TileMap): typeof REQUESTERS {
  let churchSeat = false;
  let palazzos = 0;
  for (const tile of Object.values(tiles)) {
    if (!tile.isOrigin) continue;
    if (tile.buildingId === "chapel" || tile.buildingId === "cathedral") churchSeat = true;
    if (tile.buildingId === "palazzo") palazzos++;
  }
  let housesLeft = palazzos;
  return REQUESTERS.filter((r) => (r.name === CHURCH ? churchSeat : housesLeft-- > 0));
}

/** Current favor with a faction; unwritten entries read as neutral. */
export function favorOf(favor: Record<string, number>, name: string): number {
  return favor[name] ?? FAVOR_START;
}

export type FavorTier = "affronted" | "cooled" | "neutral";

export function favorTier(value: number): FavorTier {
  return value < FAVOR_AFFRONTED ? "affronted" : value < FAVOR_COOLED ? "cooled" : "neutral";
}

/**
 * Grandeur rung (0–3) unlocked by being at or above the FAVOR_RUNGS levels.
 * The Church's rungs 2–3 additionally need a standing Cathedral (the grander
 * asks want somewhere to go); favor itself is untouched by the cap.
 */
export function favorRung(name: string, value: number, tiles: TileMap): number {
  let rung = FAVOR_RUNGS.filter((t) => value >= t).length;
  if (name === CHURCH && rung > 1) {
    const cathedral = Object.values(tiles).some(
      (t) => t.isOrigin && t.buildingId === "cathedral"
    );
    if (!cathedral) rung = 1;
  }
  return rung;
}

/** Favor a set of completed works has earned (v8 save seeding + demo city). */
export function favorFromWorks(works: { requester?: string }[]): Record<string, number> {
  const favor: Record<string, number> = {};
  for (const w of works) {
    if (!w.requester) continue;
    favor[w.requester] = Math.min(100, (favor[w.requester] ?? FAVOR_START) + FAVOR_PER_WORK);
  }
  return favor;
}

/** Shared authoritative guard for assigning an open commission to a founder's workshop. */
export function canAssignCommission(
  commission: Commission,
  founder: Artist | undefined,
  tiles: TileMap,
  supply: MaterialSupply | undefined
): boolean {
  if (commission.workshopKey || !founder) return false;
  if (founder.type !== commission.artistType || founder.workProgress != null) return false;

  const tile = tiles[founder.homeTileKey];
  if (!tile?.isOrigin || !tile.isActive) return false;
  const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
  if (metadata?.artistCapacity == null || (metadata.artistType ?? "painter") !== founder.type) {
    return false;
  }

  return !(supply && supply.inUse >= supply.capacity);
}

/**
 * Periodic commission offer (design doc, Phase 8 + factions slice 1),
 * mirroring maybeArriveArtist. Each month, if open offers are under the cap
 * and any patron is admitted, there's a chance one arrives. The type is drawn
 * from artist types present in the city (so every offer is actionable) and the
 * best rank of that type scales duration and reward; the requester skews the
 * florin/prestige split and its favor scales grandeur (or thins offers when
 * cooled/affronted). Returns null when nothing is offered. rng is injectable
 * for the self-test — draw order: gate, type, [material — sculptor only],
 * requester, [tier skip — cooled/affronted only], title.
 */
export function maybeOfferCommission(
  commissions: Commission[],
  artists: Artist[],
  currentTick: number,
  rng: () => number = Math.random,
  tiles: TileMap = {},
  favor: Record<string, number> = {}
): Commission | null {
  const open = commissions.filter((c) => !c.workshopKey);
  if (open.length >= MAX_OPEN_OFFERS) return null;

  const pool = requesterPool(tiles);
  if (pool.length === 0) return null; // no admitted patron — null before any rng draw

  const types = [...new Set(artists.map((a) => a.type))].sort();
  if (types.length === 0) return null;
  if (rng() >= COMMISSION_OFFER_CHANCE) return null;

  const type = pick(types, rng);
  // Sculptor commissions roll marble or bronze; every other type maps 1:1. The
  // extra draw happens only for sculptors, so painter/architect offer streams
  // keep their historical rng draw order.
  let material = MATERIAL_BY_ARTIST_TYPE[type];
  if (type === "sculptor" && rng() < BRONZE_COMMISSION_CHANCE) material = "bronze";
  const requester = pick(pool, rng);

  // Cooled/affronted factions offer rarely and only modest asks — but every
  // rare offer that does land is the recovery path back up the meter.
  const value = favorOf(favor, requester.name);
  const tier = favorTier(value);
  if (tier !== "neutral") {
    if (rng() < (tier === "affronted" ? AFFRONTED_SKIP_CHANCE : COOLED_SKIP_CHANCE)) return null;
  }
  const rung = tier === "neutral" ? favorRung(requester.name, value, tiles) : 0;
  const grandeur = FAVOR_GRANDEUR[rung]!;

  const bestRank = artists
    .filter((a) => a.type === type)
    .reduce<ArtistRank>(
      (best, a) => (RANK_ORDER[a.rank] > RANK_ORDER[best] ? a.rank : best),
      "apprentice"
    );
  const rankPrestige = ARTWORK_PRESTIGE[bestRank]; // 1..10 — the rank curve
  const basePrestige = rankPrestige * COMMISSION_PRESTIGE_SCALE;
  // Florins are the constraint resource, prestige is the number that goes up:
  // compress how much of the rank curve florins keep so late-rank artists don't
  // flood florins ~10x while still earning a real (if shallow) raise.
  const florinRank = 1 + (rankPrestige - 1) * FLORIN_RANK_COMPRESSION;
  const baseFlorins = FLORINS_PER_PRESTIGE * florinRank;

  const skewToFlorins = requester.mix === "florins";
  const florins = baseFlorins * (skewToFlorins ? REQUESTER_REWARD_SKEW : 1 / REQUESTER_REWARD_SKEW);
  const prestige = basePrestige * (skewToFlorins ? 1 / REQUESTER_REWARD_SKEW : REQUESTER_REWARD_SKEW);

  const titlePool =
    material === "bronze"
      ? BRONZE_TITLES
      : requester.name === CHURCH
        ? CHURCH_TITLES[type]
        : TITLES[type];

  return {
    id: crypto.randomUUID(),
    title: pick(titlePool, rng),
    requester: requester.name,
    artistType: type,
    material,
    durationMonths: Math.round(WORK_DURATION_MONTHS[bestRank] * grandeur),
    florins: Math.round(florins * grandeur),
    prestige: Math.max(1, Math.round(prestige * grandeur)),
    expiresTick: currentTick + OFFER_EXPIRY_MONTHS,
  };
}

/**
 * Housekeeping before offers/progress each tick: active commissions whose
 * workshop vanished revert to open offers (with a fresh expiry, so "reverted"
 * doesn't mean "instantly expired"), and open offers past their expiry are
 * dropped — their requesters are returned so the tick can slight their favor.
 * Pure; returns the same array identity when nothing changed.
 */
export function reconcileCommissions(
  commissions: Commission[],
  workshopKeys: Set<string>,
  currentTick: number
): { commissions: Commission[]; changed: boolean; expiredRequesters: string[] } {
  let changed = false;
  const next: Commission[] = [];
  const expiredRequesters: string[] = [];
  for (const c of commissions) {
    if (c.workshopKey && !workshopKeys.has(c.workshopKey)) {
      next.push(reopenCommission(c, currentTick));
      changed = true;
      continue;
    }
    if (!c.workshopKey && currentTick >= c.expiresTick) {
      expiredRequesters.push(c.requester);
      changed = true;
      continue;
    }
    next.push(c);
  }
  return { commissions: changed ? next : commissions, changed, expiredRequesters };
}
