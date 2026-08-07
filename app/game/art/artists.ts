import type { Artist, ArtistRank, ArtistType, Artwork, Commission } from "../types";
import { PLAZA_CONNECTION_BONUS } from "../city/connectivity.ts";
import { displayBoost } from "./display.ts";
import {
  ARTIST_ARRIVAL_CHANCE,
  ARTIST_ARRIVAL_COOLDOWN_MONTHS,
  EXTRA_ARTIST_PACE_BONUS,
  FLOOR_FRACTION,
  POOL_PER_PRESTIGE,
  RANK_XP,
  XP_RATES,
} from "../constants.ts";

// Runtime imports limited to dependency-free sim modules: artists.check.ts
// runs this file under plain Node (type-only imports are stripped).

export {
  ARTIST_ARRIVAL_CHANCE,
  ARTIST_ARRIVAL_COOLDOWN_MONTHS,
  ARTWORK_PRESTIGE,
  RANK_XP,
  WORK_DURATION_MONTHS,
  XP_RATES,
} from "../constants.ts";

export interface WorkshopSlot {
  key: string; // origin key "x,y"
  capacity: number;
  artistType: ArtistType; // the only type this workshop spawns
  isActive: boolean;
  builtTick: number;
}

// ponytail: fixed pool, duplicate names tolerated — a uniqueness guard if it ever matters.
const NAMES = [
  "Lorenzo di Marco",
  "Caterina Bellini",
  "Sandro Vittori",
  "Benedetta Rossi",
  "Piero della Valle",
  "Isabella Fontana",
  "Donato Grimaldi",
  "Agnola Ferri",
  "Cosimo Baldini",
  "Lucrezia Sforza",
  "Bartolomeo Neri",
  "Filippa Conti",
  "Andrea del Pozzo",
  "Ginevra Marini",
  "Taddeo Ricci",
  "Simona Gozzoli",
];

export function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

/**
 * Mint a fresh artist of the workshop's type, homed at its origin key.
 * startXp is the city's tradition floor for arrivals/founders (xpFloor);
 * rank derives from it, so a deep tradition spawns above apprentice.
 */
export function createArtist(
  homeTileKey: string,
  type: ArtistType,
  rng: () => number = Math.random,
  startXp = 0
): Artist {
  return {
    id: crypto.randomUUID(),
    name: pick(NAMES, rng),
    type,
    rank: rankForXp(startXp),
    homeTileKey,
    ...(startXp > 0 ? { xp: startXp } : {}),
  };
}

/**
 * City discipline XP pools (persisted primary state — the construction
 * contribution isn't recoverable from tiles). Completions feed their own
 * discipline; construction spend feeds pool.architect (in placeTiles).
 */
export type DisciplineXp = Record<ArtistType, number>;

/** The tradition floor: every artist of a discipline sits at ≥ this xp. */
export function xpFloor(pools: DisciplineXp, type: ArtistType): number {
  return FLOOR_FRACTION * pools[type];
}

/** Bank completed works into their discipline's pool. Identity when none. */
export function accrueDisciplineXp(pools: DisciplineXp, completed: Artwork[]): DisciplineXp {
  if (completed.length === 0) return pools;
  const next = { ...pools };
  for (const w of completed) {
    next[w.artistType] += XP_RATES.perCompletedWork + POOL_PER_PRESTIGE * (w.prestige ?? 0);
  }
  return next;
}

/**
 * Raise every artist to the tradition floor, rank re-derived (never demotes).
 * Pools only grow, so this is monotonic. Identity when no one moves.
 */
export function applyXpFloor(artists: Artist[], pools: DisciplineXp): Artist[] {
  let changed = false;
  const next = artists.map((a) => {
    const floor = xpFloor(pools, a.type);
    if ((a.xp ?? 0) >= floor) return a;
    changed = true;
    return { ...a, ...gainXp(a, floor - (a.xp ?? 0)) };
  });
  return changed ? next : artists;
}

/**
 * The highest-xp non-founder of a discipline — the bench artist who graduates
 * to found a newly placed workshop. Founder = first artist at a key; ties
 * break by array order (strict >). Null when there's no bench.
 */
export function pickGraduate(artists: Artist[], type: ArtistType): Artist | null {
  const founders = new Set<string>();
  let best: Artist | null = null;
  for (const a of artists) {
    if (!founders.has(a.homeTileKey)) {
      founders.add(a.homeTileKey); // first at key = founder, never graduates
      continue;
    }
    if (a.type !== type) continue;
    if (!best || (a.xp ?? 0) > (best.xp ?? 0)) best = a;
  }
  return best;
}

/**
 * Passive artist arrival (design doc, Phase 5). Each month, if the city has any
 * inspiration and at least one active workshop with a free slot, there's a
 * chance one artist arrives at the city's tradition floor, bound to the first
 * open workshop by key sort (same deterministic tiebreak as allocateWorkers).
 * Returns null when nothing arrives. rng is injectable for the self-test.
 */
export function maybeArriveArtist(
  workshops: WorkshopSlot[],
  artists: Artist[],
  inspiration: number,
  currentTick: number,
  rng: () => number = Math.random,
  disciplineXp?: DisciplineXp
): Artist | null {
  if (inspiration <= 0) return null;

  const counts = new Map<string, number>();
  for (const a of artists) {
    counts.set(a.homeTileKey, (counts.get(a.homeTileKey) ?? 0) + 1);
  }

  const open = workshops
    .filter((at) => {
      const isCooledDown = currentTick - at.builtTick >= ARTIST_ARRIVAL_COOLDOWN_MONTHS;
      return isCooledDown && at.isActive && (counts.get(at.key) ?? 0) < at.capacity;
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  if (open.length === 0) return null;
  if (rng() >= ARTIST_ARRIVAL_CHANCE) return null;

  const type = open[0]!.artistType;
  return createArtist(open[0]!.key, type, rng, disciplineXp ? xpFloor(disciplineXp, type) : 0);
}

export const RANK_LABEL: Record<ArtistRank, string> = {
  apprentice: "Apprentice",
  journeyman: "Journeyman",
  artisan: "Artisan",
  virtuoso: "Virtuoso",
  master: "Master",
  renowned_master: "Renowned Master",
  grand_master: "Grand Master",
};

export const RANK_ORDER: Record<ArtistRank, number> = {
  apprentice: 0,
  journeyman: 1,
  artisan: 2,
  virtuoso: 3,
  master: 4,
  renowned_master: 5,
  grand_master: 6,
};

// ponytail: fixed pool, duplicate titles tolerated — same deal as NAMES.
export const TITLES: Record<ArtistType, string[]> = {
  painter: [
    "Madonna of the Lilies",
    "The Annunciation",
    "Portrait of a Young Merchant",
    "Allegory of Spring",
  ],
  // Sculpture titles are real works, each backed by a scan (STATUE_MODELS in
  // artImages.ts) — antiquities here, the kind a patron collected all'antica.
  sculptor: ["Cincinnatus", "The Spinario", "Neptune", "The Reclining Pan"],
  architect: [
    "Design for a Great Dome",
    "Loggia of the Silk Guild",
    "Plan for a Riverside Villa",
    "Facade of San Marco",
  ],
};

// Church commissions draw devotional titles instead of TITLES (factions slice 1).
export const CHURCH_TITLES: Record<ArtistType, string[]> = {
  painter: [
    "Fresco of the Last Judgment",
    "Altarpiece of the Virgin",
    "The Adoration of the Magi",
    "Saint Jerome in His Study",
  ],
  sculptor: [
    "The Transi of René de Chalon",
    "Saint Hugh",
    "Queen Margaret",
  ],
  architect: [
    "Design for a Sacristy",
    "Plan for a Chapter House",
    "Facade of the Pieve",
    "Design for a Family Chapel",
  ],
};

// Titles for bronze-cast sculpture commissions (see BRONZE_COMMISSION_CHANCE)
// — works whose originals were themselves cast in bronze.
export const BRONZE_TITLES = [
  "Theodoric the Great",
  "The Minerva of Arezzo",
  "The Orator",
  "Hermes Fastening His Sandal",
];

/** XP threshold of the next rank up, or null at the top (grand master). */
export function nextRankXp(rank: ArtistRank): number | null {
  const nextOrder = RANK_ORDER[rank] + 1;
  for (const r of RANK_XP) {
    if (RANK_ORDER[r.rank] === nextOrder) return r.xp;
  }
  return null;
}

/** The rank a given xp total has earned outright. */
export function rankForXp(xp: number): ArtistRank {
  return RANK_XP.find((r) => xp >= r.xp)?.rank ?? "apprentice";
}

/** xp+amount with rank-up at the RANK_XP thresholds; never demotes. */
function gainXp(a: Artist, amount: number): Pick<Artist, "xp" | "rank"> {
  const xp = (a.xp ?? 0) + amount;
  const earned = rankForXp(xp);
  const rank = RANK_ORDER[earned] > RANK_ORDER[a.rank] ? earned : a.rank;
  return { xp, rank };
}

/**
 * Advance every working workshop one month (design doc, Phase 6). An workshop's
 * work is tracked on its founding artist and progresses only while the workshop
 * is active and city inspiration > 0, at 1 + 0.5×(members − 1) months per tick
 * (more artists work faster, with diminishing returns), scaled up to ×1.25
 * by the workshop's plaza-connection strength (Phase 10). The assigned commission
 * sets duration, name, and payout; completion mints an Artwork, pays the
 * commission's florins + prestige, and grants every member perCompletedWork xp
 * (each may rank up) — completions are the only personal XP source; the
 * discipline pool's floor covers everything else. Pure; unchanged artists keep
 * object identity.
 */
// ponytail: work progress rides on the founder artist — 1:1 with the workshop,
// avoids a new persisted map. Founder = first artist homed at the key; array
// order keeps that stable: keys gain members only by sole-founding (placement
// or graduate rehome — a .map that preserves order and only ever moves
// non-founders) or by appended arrivals, so "first at key" is always the founder.
export function progressArtworks(
  artists: Artist[],
  workshops: WorkshopSlot[],
  commissions: Commission[],
  inspiration: number,
  currentTick: number,
  plazaConnected?: Map<string, number>, // workshop origin key → plaza strength (0..1]
  displayCounts?: Map<string, number> // workshop origin key → displayed-work count
): {
  artists: Artist[];
  completed: Artwork[];
  finishedCommissionIds: string[];
  prestige: number;
  florins: number;
  changed: boolean;
} {
  const idle = {
    artists,
    completed: [],
    finishedCommissionIds: [],
    prestige: 0,
    florins: 0,
    changed: false,
  };
  if (inspiration <= 0) return idle;

  const byKey = new Map<string, Commission>();
  for (const c of commissions) {
    if (c.workshopKey) byKey.set(c.workshopKey, c);
  }

  const activeKeys = new Set(workshops.filter((at) => at.isActive).map((at) => at.key));
  const founders = new Map<string, Artist>();
  const counts = new Map<string, number>();
  for (const a of artists) {
    if (!founders.has(a.homeTileKey)) founders.set(a.homeTileKey, a);
    counts.set(a.homeTileKey, (counts.get(a.homeTileKey) ?? 0) + 1);
  }

  const advancing = new Map<string, number>(); // key → new progress
  const completedKeys = new Set<string>();
  const completed: Artwork[] = [];
  const finishedCommissionIds: string[] = [];
  let prestige = 0;
  let florins = 0;

  for (const [key, founder] of founders) {
    if (founder.workProgress == null || !activeKeys.has(key)) continue;
    const commission = byKey.get(key);
    if (!commission) continue; // orphaned progress; reconcile re-opens the offer
    const pace =
      (1 + EXTRA_ARTIST_PACE_BONUS * ((counts.get(key) ?? 1) - 1)) *
      (1 + PLAZA_CONNECTION_BONUS * (plazaConnected?.get(key) ?? 0)) *
      displayBoost(displayCounts?.get(key) ?? 0);
    const progress = founder.workProgress + pace;
    if (progress < commission.durationMonths) {
      advancing.set(key, progress);
      continue;
    }
    completedKeys.add(key);
    completed.push({
      id: crypto.randomUUID(),
      name: commission.title,
      requester: commission.requester,
      artistId: founder.id,
      artistType: founder.type,
      completedTick: currentTick,
      prestige: commission.prestige, // captured for display quality; the commission is gone next tick
      material: commission.material, // marble/bronze, for the statue's render treatment
    });
    finishedCommissionIds.push(commission.id);
    prestige += commission.prestige;
    florins += commission.florins;
  }

  if (advancing.size === 0 && completedKeys.size === 0) return idle;

  const next = artists.map((a) => {
    const key = a.homeTileKey;
    if (!activeKeys.has(key)) return a; // workshop inactive: no progress

    const completing = completedKeys.has(key);
    const isFounder = founders.get(key) === a;
    const progress = advancing.get(key);
    if (!completing && !(isFounder && progress != null)) return a;
    return {
      ...a,
      ...(completing ? gainXp(a, XP_RATES.perCompletedWork) : {}),
      ...(completing && isFounder ? { workProgress: undefined } : {}),
      ...(!completing && progress != null && isFounder ? { workProgress: progress } : {}),
    };
  });

  return { artists: next, completed, finishedCommissionIds, prestige, florins, changed: true };
}
