import { favorFromWorks } from "./art/commissions.ts";

export const SAVE_VERSION = 11;

/** Preserve compatible saves while explicitly discarding structurally obsolete versions. */
export function migrateSave(persisted: unknown, version: number): unknown {
  // Pre-v5 footprints and commission data are incompatible with the current map.
  if (version < 5) return {};
  let save = persisted as {
    mapSeed?: unknown;
    artists?: { xp?: number }[];
    artworks?: { requester?: string; displayedAt?: { key: string; slot: number } }[];
    favor?: Record<string, number>;
    materials?: Record<string, number>;
    commissions?: { building?: string }[];
    fundedBuilds?: string[];
    map?: { tiles?: Record<string, { buildingId?: string }> };
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
  // v11 removed the Baptistery and Loggia outright: their tiles vanish
  // (prestige already banked stays banked), their pending/active blueprints and
  // funded-build tokens are dropped, and works displayed on them return to
  // storage. Completed blueprint designs stay in the gallery as artworks.
  if (version < 11) {
    const removed = new Set(["baptistery", "loggia"]);
    const tiles = save.map?.tiles ?? {};
    const gone = new Set(
      Object.keys(tiles).filter((k) => removed.has(tiles[k]?.buildingId ?? ""))
    );
    if (gone.size > 0) {
      save = {
        ...save,
        map: {
          ...save.map,
          tiles: Object.fromEntries(Object.entries(tiles).filter(([k]) => !gone.has(k))),
        },
        artworks: (save.artworks ?? []).map((a) =>
          a.displayedAt && gone.has(a.displayedAt.key) ? { ...a, displayedAt: undefined } : a
        ),
      };
    }
    if (save.commissions?.some((c) => removed.has(c.building ?? ""))) {
      save = { ...save, commissions: save.commissions.filter((c) => !removed.has(c.building ?? "")) };
    }
    if (save.fundedBuilds?.some((b) => removed.has(b))) {
      save = { ...save, fundedBuilds: save.fundedBuilds.filter((b) => !removed.has(b)) };
    }
  }
  return save;
}
