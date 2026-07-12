// Run seed — a short, shareable alpha string generated per new game.
// Design doc "Seed system" (stretch): the seed will later drive terrain scatter,
// available resources, and faction archetypes. Today its only job is choosing the
// starting city name deterministically. Keep the wiring surface in this file.

import { seededRng } from "./random.ts";

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

/** A fresh run seed: short, lowercase alphanumeric, human-readable/shareable. */
export function generateSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** The starting city name for a run, derived deterministically from its seed. */
export function pickCityName(seed: string): string {
  return CITY_NAMES[Math.floor(seededRng(seed)() * CITY_NAMES.length)]!;
}
