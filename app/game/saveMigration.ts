export const SAVE_VERSION = 8;

/** Preserve compatible saves while explicitly discarding structurally obsolete versions. */
export function migrateSave(persisted: unknown, version: number): unknown {
  // Pre-v5 footprints and commission data are incompatible with the current map.
  if (version < 5) return {};
  let save = persisted as {
    mapSeed?: unknown;
    artists?: { xp?: number }[];
    map?: { roads?: unknown };
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
  // v8 added freeform roads. Preserving, like v6's mapSeed: absent → empty, so
  // an old city keeps its grid roads and simply has no freeform segments yet.
  if (version < 8 && save.map && save.map.roads == null) {
    save = { ...save, map: { ...save.map, roads: [] } };
  }
  return save;
}
