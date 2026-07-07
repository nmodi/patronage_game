import type { Artist, ArtistRank, ArtistType, Artwork } from "./types";

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

function pick<T>(items: T[], rng: () => number): T {
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
  master: 4,
};

export const ARTWORK_PRESTIGE: Record<ArtistRank, number> = {
  apprentice: 1,
  journeyman: 2,
  master: 4,
};

// xp = completed works: 2 → journeyman, 5 → master.
export const RANK_XP: { rank: ArtistRank; xp: number }[] = [
  { rank: "master", xp: 5 },
  { rank: "journeyman", xp: 2 },
];

const RANK_ORDER: Record<ArtistRank, number> = { apprentice: 0, journeyman: 1, master: 2 };

// ponytail: fixed pool, duplicate titles tolerated — same deal as NAMES.
const TITLES: Record<ArtistType, string[]> = {
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
  illuminator: [
    "Book of Hours",
    "Gilded Psalter",
    "Herbal of the Apothecaries",
    "Chronicle of the City",
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
 * (more artists work faster, with diminishing returns). The founder's rank sets
 * duration and prestige; completion mints an Artwork and grants every member
 * 1 xp (each may rank up). Pure; unchanged artists keep object identity. rng
 * only names artworks.
 */
// ponytail: work progress rides on the founder artist — 1:1 with the workshop,
// avoids a new persisted map. Founder = first artist homed at the key; nothing
// removes a single artist, so array order keeps that stable.
export function progressArtworks(
  artists: Artist[],
  workshops: WorkshopSlot[],
  inspiration: number,
  currentTick: number,
  rng: () => number = Math.random
): { artists: Artist[]; completed: Artwork[]; prestige: number; changed: boolean } {
  const idle = { artists, completed: [], prestige: 0, changed: false };
  if (inspiration <= 0) return idle;

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
  let prestige = 0;

  for (const [key, founder] of founders) {
    if (founder.workProgress == null || !activeKeys.has(key)) continue;
    const progress = founder.workProgress + 1 + 0.5 * ((counts.get(key) ?? 1) - 1);
    if (progress < WORK_DURATION_MONTHS[founder.rank]) {
      advancing.set(key, progress);
      continue;
    }
    completedKeys.add(key);
    completed.push({
      id: crypto.randomUUID(),
      name: pick(TITLES[founder.type], rng),
      artistId: founder.id,
      artistType: founder.type,
      completedTick: currentTick,
    });
    prestige += ARTWORK_PRESTIGE[founder.rank];
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

  return { artists: next, completed, prestige, changed: true };
}
