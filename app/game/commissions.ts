import { BUILDING_METADATA_BY_ID } from "./buildings.ts";
import {
  BRONZE_COMMISSION_CHANCE,
  COMMISSION_OFFER_CHANCE,
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
  // Sculptor commissions roll marble or bronze; every other type maps 1:1. The
  // extra draw happens only for sculptors, so painter/architect offer streams
  // keep their historical rng draw order (gate, type, requester, title).
  let material = MATERIAL_BY_ARTIST_TYPE[type];
  if (type === "sculptor" && rng() < BRONZE_COMMISSION_CHANCE) material = "bronze";
  const bestRank = artists
    .filter((a) => a.type === type)
    .reduce<ArtistRank>(
      (best, a) => (RANK_ORDER[a.rank] > RANK_ORDER[best] ? a.rank : best),
      "apprentice"
    );
  const requester = pick(REQUESTERS, rng);
  const basePrestige = ARTWORK_PRESTIGE[bestRank];
  const baseFlorins = FLORINS_PER_PRESTIGE * basePrestige;

  let florins = baseFlorins;
  let prestige = basePrestige;
  if (requester.mix === "florins") {
    florins = baseFlorins * REQUESTER_REWARD_SKEW;
    prestige = Math.max(1, Math.round(basePrestige / REQUESTER_REWARD_SKEW));
  } else if (requester.mix === "prestige") {
    florins = Math.round(baseFlorins / REQUESTER_REWARD_SKEW);
    prestige = basePrestige * REQUESTER_REWARD_SKEW;
  }

  return {
    id: crypto.randomUUID(),
    title: pick(material === "bronze" ? BRONZE_TITLES : TITLES[type], rng),
    requester: requester.name,
    artistType: type,
    material,
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
      next.push(reopenCommission(c, currentTick));
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
