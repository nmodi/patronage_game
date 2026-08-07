// Phase 12 — the Renaissance milestone (design doc, "The Goal"). Four gates,
// all derived from persisted state each call — no tracking, no save fields
// beyond the store's one-shot renaissanceReached celebration flag.
// No React/Zustand/Babylon imports: renaissance.check.ts runs this under plain Node.
import type { DisciplineXp } from "./artists.ts";
import {
  RENAISSANCE_NOBLE_HOUSES,
  RENAISSANCE_PRESTIGE,
  RENAISSANCE_TRADITION_XP,
  WONDER_PRESTIGE,
} from "../constants.ts";
import { artworkQuality } from "./display.ts";
import type { Artwork } from "../types.ts";

export interface RenaissanceProgress {
  prestige: boolean; // city prestige at the threshold
  master: boolean; // a completions-fed discipline pool at the tradition threshold
  wonder: Artwork | null; // a displayed work of WONDER_PRESTIGE quality — people travel to see it
  church: boolean; // a completed work for the Church
  nobleHouses: number; // distinct noble houses ("House …") with a completed work
  all: boolean;
}

// ponytail: gates on completed works, not the favor meter — a work is earned
// forever, favor wobbles. Guild requesters (removed from REQUESTERS; old saves
// may still hold their works) don't match either branch and are ignored.
export function renaissanceProgress(
  prestige: number,
  disciplineXp: DisciplineXp,
  artworks: Artwork[]
): RenaissanceProgress {
  const wonder =
    artworks.find((w) => w.displayedAt && artworkQuality(w) >= WONDER_PRESTIGE) ?? null;
  const houses = new Set<string>();
  let church = false;
  for (const w of artworks) {
    if (w.requester === "The Church") church = true;
    else if (w.requester?.startsWith("House ")) houses.add(w.requester);
  }
  const prestigeMet = prestige >= RENAISSANCE_PRESTIGE;
  // Only the completions-fed pools count: pool.architect is construction-fed
  // (no commissions while the blueprint roster is empty), and building spend
  // alone must never satisfy an artistic-mastery gate.
  const master =
    Math.max(disciplineXp.painter, disciplineXp.sculptor) >= RENAISSANCE_TRADITION_XP;
  return {
    prestige: prestigeMet,
    master,
    wonder,
    church,
    nobleHouses: houses.size,
    all:
      prestigeMet && master && wonder != null && church && houses.size >= RENAISSANCE_NOBLE_HOUSES,
  };
}
