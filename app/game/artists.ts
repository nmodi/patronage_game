import type { Artist, ArtistRank, ArtistType, Artwork, Commission } from "./types";
import { PLAZA_CONNECTION_BONUS } from "./connectivity.ts";
import { displayBoost } from "./display.ts";
import {
  ARTIST_ARRIVAL_CHANCE,
  ARTIST_ARRIVAL_COOLDOWN_MONTHS,
  EXTRA_ARTIST_PACE_BONUS,
  RANK_XP,
  XP_RATES,
} from "./constants.ts";

// Runtime imports limited to dependency-free sim modules: artists.check.ts
// runs this file under plain Node (type-only imports are stripped).

export {
  ARTIST_ARRIVAL_CHANCE,
  ARTIST_ARRIVAL_COOLDOWN_MONTHS,
  ARTWORK_PRESTIGE,
  RANK_XP,
  WORK_DURATION_MONTHS,
  XP_RATES,
} from "./constants.ts";

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

/** Mint a fresh apprentice of the workshop's type, homed at its origin key. */
export function createArtist(
  homeTileKey: string,
  type: ArtistType,
  rng: () => number = Math.random
): Artist {
  return {
    id: crypto.randomUUID(),
    name: pick(NAMES, rng),
    type,
    rank: "apprentice",
    homeTileKey,
  };
}

/**
 * Passive artist arrival (design doc, Phase 5). Each month, if the city has any
 * inspiration and at least one active workshop with a free slot, there's a
 * chance one apprentice arrives, bound to the first open workshop by key sort
 * (same deterministic tiebreak as allocateWorkers). Returns null when nothing
 * arrives. rng is injectable for the self-test.
 */
export function maybeArriveArtist(
  workshops: WorkshopSlot[],
  artists: Artist[],
  inspiration: number,
  currentTick: number,
  rng: () => number = Math.random
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

  return createArtist(open[0]!.key, open[0]!.artistType, rng);
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
  sculptor: [
    "David in Marble",
    "Pietà in Marble",
    "Fountain of the Muses",
    "Bust of a Patrician",
  ],
  architect: [
    "Design for a Great Dome",
    "Loggia of the Silk Guild",
    "Plan for a Riverside Villa",
    "Facade of San Marco",
  ],
};

// Titles for bronze-cast sculpture commissions (see BRONZE_COMMISSION_CHANCE).
export const BRONZE_TITLES = [
  "The Bronze Horseman",
  "Perseus with the Head of Medusa",
  "The Gates of Paradise",
  "Equestrian Monument of the Condottiere",
];

/** xp+amount with rank-up at the RANK_XP thresholds; never demotes. */
function gainXp(a: Artist, amount: number): Pick<Artist, "xp" | "rank"> {
  const xp = (a.xp ?? 0) + amount;
  const earned = RANK_XP.find((r) => xp >= r.xp)?.rank;
  const rank = earned && RANK_ORDER[earned] > RANK_ORDER[a.rank] ? earned : a.rank;
  return { xp, rank };
}

/**
 * Advance every working workshop one month (design doc, Phase 6). An workshop's
 * work is tracked on its founding artist and progresses only while the workshop
 * is active and city inspiration > 0, at 1 + 0.5×(members − 1) months per tick
 * (more artists work faster, with diminishing returns), scaled up to ×1.25
 * by the workshop's plaza-connection strength (Phase 10). The assigned commission
 * sets duration, name, and payout; completion mints an Artwork, pays the
 * commission's florins + prestige, and grants every member 1 xp (each may rank
 * up). Pure; unchanged artists keep object identity.
 */
// ponytail: work progress rides on the founder artist — 1:1 with the workshop,
// avoids a new persisted map. Founder = first artist homed at the key; nothing
// removes a single artist, so array order keeps that stable.
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
  const workshopMaxRank = new Map<string, number>(); // for teaching: any workshop-mate, not just the founder
  for (const a of artists) {
    if (!founders.has(a.homeTileKey)) founders.set(a.homeTileKey, a);
    counts.set(a.homeTileKey, (counts.get(a.homeTileKey) ?? 0) + 1);
    const rank = RANK_ORDER[a.rank];
    if (rank > (workshopMaxRank.get(a.homeTileKey) ?? -1)) workshopMaxRank.set(a.homeTileKey, rank);
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

  const anyPracticing = artists.some((a) => activeKeys.has(a.homeTileKey));
  if (advancing.size === 0 && completedKeys.size === 0 && !anyPracticing) return idle;

  const next = artists.map((a) => {
    const key = a.homeTileKey;
    if (!activeKeys.has(key)) return a; // workshop inactive: no practice, no progress

    const completing = completedKeys.has(key);
    const maxRank = workshopMaxRank.get(key) ?? RANK_ORDER[a.rank];
    const taught = RANK_ORDER[a.rank] < maxRank;
    const xpGain =
      XP_RATES.practicePerMonth * (taught ? XP_RATES.teachingMultiplier : 1) +
      (completing ? XP_RATES.perCompletedWork : 0);

    const isFounder = founders.get(key) === a;
    const progress = advancing.get(key);
    return {
      ...a,
      ...gainXp(a, xpGain),
      ...(completing && isFounder ? { workProgress: undefined } : {}),
      ...(!completing && progress != null && isFounder ? { workProgress: progress } : {}),
    };
  });

  return { artists: next, completed, finishedCommissionIds, prestige, florins, changed: true };
}
