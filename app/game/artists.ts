import type { Artist, ArtistRank, ArtistType, Artwork, Commission } from "./types";

// No runtime imports here: artists.check.ts runs this file under plain Node
// (type-only imports are stripped), mirroring workers.ts.

export const ARTIST_ARRIVAL_CHANCE = 0.1; // per month, when a slot is open
export const ARTIST_ARRIVAL_COOLDOWN_MONTHS = 2;

export interface WorkshopSlot {
  key: string; // origin key "x,y"
  capacity: number;
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

const SPAWNABLE_TYPES: ArtistType[] = ["painter", "sculptor"];

export function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

/** Mint a fresh apprentice homed at the given workshop origin key. */
export function createArtist(homeTileKey: string, rng: () => number = Math.random): Artist {
  return {
    id: crypto.randomUUID(),
    name: pick(NAMES, rng),
    type: pick(SPAWNABLE_TYPES, rng),
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

  return createArtist(open[0]!.key, rng);
}

export const WORK_DURATION_MONTHS: Record<ArtistRank, number> = {
  apprentice: 6,
  journeyman: 5,
  artisan: 5,
  virtuoso: 4,
  master: 4,
  renowned_master: 3,
  grand_master: 3,
};

export const ARTWORK_PRESTIGE: Record<ArtistRank, number> = {
  apprentice: 1,
  journeyman: 2,
  artisan: 3,
  virtuoso: 4,
  master: 6,
  renowned_master: 8,
  grand_master: 10,
};

export const RANK_LABEL: Record<ArtistRank, string> = {
  apprentice: "Apprentice",
  journeyman: "Journeyman",
  artisan: "Artisan",
  virtuoso: "Virtuoso",
  master: "Master",
  renowned_master: "Renowned Master",
  grand_master: "Grand Master",
};

// xp = completed works, cumulative thresholds with escalating steps so each
// promotion takes years of game time and top ranks stay rare.
export const RANK_XP: { rank: ArtistRank; xp: number }[] = [
  { rank: "grand_master", xp: 40 },
  { rank: "renowned_master", xp: 30 },
  { rank: "master", xp: 22 },
  { rank: "virtuoso", xp: 15 },
  { rank: "artisan", xp: 9 },
  { rank: "journeyman", xp: 4 },
];

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
    "The Bronze Horseman",
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

/** xp+1 with rank-up at the RANK_XP thresholds; never demotes. */
function gainXp(a: Artist): Pick<Artist, "xp" | "rank"> {
  const xp = (a.xp ?? 0) + 1;
  const earned = RANK_XP.find((r) => xp >= r.xp)?.rank;
  const rank = earned && RANK_ORDER[earned] > RANK_ORDER[a.rank] ? earned : a.rank;
  return { xp, rank };
}

/**
 * Advance every working workshop one month (design doc, Phase 6). An workshop's
 * work is tracked on its founding artist and progresses only while the workshop
 * is active and city inspiration > 0, at 1 + 0.5×(members − 1) months per tick
 * (more artists work faster, with diminishing returns). The assigned commission
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
  currentTick: number
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
    const progress = founder.workProgress + 1 + 0.5 * ((counts.get(key) ?? 1) - 1);
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
    });
    finishedCommissionIds.push(commission.id);
    prestige += commission.prestige;
    florins += commission.florins;
  }

  if (advancing.size === 0 && completedKeys.size === 0) return idle;

  const next = artists.map((a) => {
    if (completedKeys.has(a.homeTileKey)) {
      const isFounder = founders.get(a.homeTileKey) === a;
      return { ...a, ...gainXp(a), ...(isFounder ? { workProgress: undefined } : {}) };
    }
    const progress = advancing.get(a.homeTileKey);
    if (progress != null && founders.get(a.homeTileKey) === a) {
      return { ...a, workProgress: progress };
    }
    return a;
  });

  return { artists: next, completed, finishedCommissionIds, prestige, florins, changed: true };
}
