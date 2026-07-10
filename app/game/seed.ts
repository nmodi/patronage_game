// Run seed — a short, shareable alpha string generated per new game.
// Design doc "Seed system" (stretch): the seed will later drive terrain scatter,
// available resources, and faction archetypes. Today its only job is choosing the
// starting city name deterministically. Keep the wiring surface in this file.

// ponytail: fixed pool, fictional Renaissance-Italian names.
const CITY_NAMES = [
  "Bellafonte",
  "Montecielo",
  "Valdoro",
  "Fiorenza",
  "Serravalle",
  "Belmonte",
  "Vallombra",
  "Pietrasanta",
  "Montebello",
  "Altavilla",
  "Castellarte",
  "Rivalta",
  "Sanreggio",
  "Vellamare",
  "Costalta",
  "Doratino",
];

// mulberry32 PRNG (same algorithm as render/terrain.ts, kept local so this stays
// Babylon-free and importable from the store).
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a string hash → 32-bit seed for the PRNG.
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 0-1 generator for a run seed. */
export function seededRng(seed: string): () => number {
  return mulberry32(hashString(seed));
}

/** A fresh run seed: short, lowercase alphanumeric, human-readable/shareable. */
export function generateSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** The starting city name for a run, derived deterministically from its seed. */
export function pickCityName(seed: string): string {
  return CITY_NAMES[Math.floor(seededRng(seed)() * CITY_NAMES.length)]!;
}
