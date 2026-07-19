// Phase 12 — the Renaissance milestone (design doc, "The Goal"). Four gates,
// all derived from persisted state each call — no tracking, no save fields
// beyond the store's one-shot renaissanceReached celebration flag.
// No React/Zustand/Babylon imports: renaissance.check.ts runs this under plain Node.
import { RANK_ORDER } from "./artists.ts";
import {
  RENAISSANCE_NOBLE_HOUSES,
  RENAISSANCE_PRESTIGE,
  WONDER_PRESTIGE,
} from "./constants.ts";
import { artworkQuality } from "./display.ts";
import type { Artist, Artwork } from "./types.ts";

export interface RenaissanceProgress {
  prestige: boolean; // city prestige at the threshold
  master: boolean; // any artist ranked Master or above
  wonder: Artwork | null; // a displayed work of WONDER_PRESTIGE quality — people travel to see it
  church: boolean; // a completed work for the Church
  nobleHouses: number; // distinct noble houses ("House …") with a completed work
  all: boolean;
}

// ponytail: "positive favor with each faction" before factions exist — per-
// requester completed works is exactly factions.md's favor count, so this
// upgrades to real favor ladders when that phase lands. Guild requesters
// (slated for removal) don't match either branch and are ignored.
export function renaissanceProgress(
  prestige: number,
  artists: Artist[],
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
  const master = artists.some((a) => RANK_ORDER[a.rank] >= RANK_ORDER.master);
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
