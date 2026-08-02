import { favorFromWorks } from "./art/commissions.ts";

export const SAVE_VERSION = 10;

/** Preserve compatible saves while explicitly discarding structurally obsolete versions. */
export function migrateSave(persisted: unknown, version: number): unknown {
  // Pre-v5 footprints and commission data are incompatible with the current map.
  if (version < 5) return {};
  let save = persisted as {
    mapSeed?: unknown;
    artists?: { xp?: number }[];
    artworks?: { requester?: string }[];
    favor?: Record<string, number>;
    materials?: Record<string, number>;
  };
  // v5 predates seeded water. Keeping it permanently dry avoids placing a new
  // river through an existing city.
  if (version === 5) save = { ...save, mapSeed: null };
  // v7 rescaled XP ×100 (one completed work: 1 → 100 xp).
  if (version < 7) {
    save = {
      ...save,
      artists: (save.artists ?? []).map((a) => ({ ...a, xp: (a.xp ?? 0) * 100 })),
    };
  }
  // v8 added per-faction favor (factions slice 1) — seed it from completed
  // works so old saves keep the standing they earned.
  if (version < 8) {
    save = { ...save, favor: favorFromWorks(save.artworks ?? []) };
  }
  // v9 turned supplier capacity into accumulating stock. Pools start empty:
  // pre-v9 offers carry no materialCost (so they stay free to assign), work
  // already in flight never re-checks, and suppliers refill within months.
  if (version < 9) {
    save = { ...save, materials: { pigment: 0, marble: 0, bronze: 0 } };
  }
  // v10 added construction materials (timber/stone pools, spent by grand
  // buildings at placement). Pools start empty like v9's.
  if (version < 10) {
    save = { ...save, materials: { timber: 0, stone: 0, ...(save.materials ?? {}) } };
  }
  return save;
}
