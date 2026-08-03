import { create } from "zustand";
import type { StateCreator } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { Artist, Artwork, Commission, Material } from "~/game/types";
import { origins, type BuildingId } from "~/game/buildings";
import type { GridPos, Tile, TileMap } from "~/game/grid";
import { planPlacement } from "~/game/placement/placementRules";
import { applyFavor, canAssignCommission } from "~/game/art/commissions";
import { canDisplayWork } from "~/game/art/display";
import { createArtist, trainOnConstruction } from "~/game/art/artists";
import { generateSeed, pickCityName } from "~/game/map/seed";
import { DEMO_MAP_SEED } from "~/game/demo/demoLayout";
import {
  commissionMaterial,
  commissionMaterialCost,
  EMPTY_POOLS,
  type MaterialPools,
} from "~/game/art/materials";
import { computeDisplaySummary } from "~/game/art/display";
import { computeCityMetrics } from "~/game/city/metrics";
import { razeBuilding } from "~/game/placement/raze";
import { playSfx } from "~/game/audio/sfx";
import { migrateSave, SAVE_VERSION } from "~/game/saveMigration";
import { advanceTick } from "~/game/tick";
import {
  BASE_TICK_INTERVAL,
  DENOUNCE_PRESTIGE,
  FAVOR_SLIGHT,
  STARTING_FLORINS,
} from "~/game/constants";

// The demolition tool rides the building-selection slot: camera-drag detach,
// grid visibility, and the palette's cancel keys all treat it like placement.
export const RAZE_TOOL = "raze" as const;

export interface MapState {
  tiles: TileMap;  // Key is "x,y"
  selectedBuilding: BuildingId | typeof RAZE_TOOL | null;
}

export interface TimeState {
  tickCount: number;
}

export type GameState = {
  seed: string;
  // Seed the run's map (water archetype, river course, coastline) derives
  // from; null = no water anywhere (old saves, demo). Kept separate from
  // `seed` so pre-water saves stay dry.
  mapSeed: string | null;
  cityName: string;
  setCityName: (value: string) => void;
  florins: number;
  inspiration: number;
  prestige: number;
  population: number;
  artists: Artist[];
  artworks: Artwork[];
  commissions: Commission[];
  // Per-faction favor 0–100 (factions slice 1); unwritten entries read FAVOR_START.
  favor: Record<string, number>;
  materials: MaterialPools;
  // Structures unlocked by completed blueprint commissions, awaiting placement
  // (one token each; consumed by placeTiles at 0 florins).
  fundedBuilds: string[];
  assignCommission: (commissionId: string, workshopKey: string) => void;
  // Drop an open offer for a favor slight; no-op if assigned or missing.
  declineCommission: (commissionId: string) => void;
  addFlorins: (amount: number) => void;
  setFlorins: (value: number) => void;
  setPopulation: (value: number) => void;
  // One-shot celebration flag: the Renaissance card was shown and dismissed.
  // The milestone itself is derived live from state (renaissance.ts).
  renaissanceReached: boolean;
  dismissRenaissance: () => void;
  hoveredTileKey: string | null;
  setHoveredTile: (key: string | null) => void;
  // Origin key awaiting raze confirmation (building houses artists or a
  // commission); null = no prompt. Transient — never persisted.
  razeTarget: string | null;
  setRazeTarget: (key: string | null) => void;
  // Building whose work-display panel is open (idle click on a slotted
  // host); slot set when a filled plinth cell was clicked directly. Transient.
  inspectTarget: { key: string; slot?: number } | null;
  setInspectTarget: (target: { key: string; slot?: number } | null) => void;
  // Latest unseen open-offer id (arrival card) and denouncing faction name
  // (its darker sibling). Transient — never persisted, razeTarget pattern.
  offerAlert: string | null;
  setOfferAlert: (id: string | null) => void;
  denounceAlert: string | null;
  setDenounceAlert: (name: string | null) => void;
  // Title of the track the music engine is playing. Transient, same pattern.
  nowPlaying: string | null;
  setNowPlaying: (title: string | null) => void;
  displayArtwork: (artworkId: string, hostKey: string, slot: number) => void;
  recallArtwork: (artworkId: string) => void;
  tick: () => void;
  map: MapState;
  time: TimeState;
  paused: boolean;
  togglePause: () => void;
  setPaused: (value: boolean) => void;
  tickInterval: number;
  setTickInterval: (value: number) => void;
  musicVolume: number;
  setMusicVolume: (value: number) => void;
  sfxVolume: number;
  setSfxVolume: (value: number) => void;
  ambienceVolume: number;
  setAmbienceVolume: (value: number) => void;
  setSelectedBuilding: (id: BuildingId | typeof RAZE_TOOL | null) => void;
  placeTile: (position: GridPos, buildingId: BuildingId, rotation?: number) => boolean;
  placeTiles: (positions: GridPos[], buildingId: BuildingId, rotation?: number) => boolean;
  removeTile: (position: GridPos) => void;
  getTileAt: (position: GridPos) => Tile | undefined;
  getHousing: () => number;
  getCalendarLabel: () => string;
  resetGame: (seed?: string) => void;
};

// ?map=<seed> (dev): force the map's water layer for course/visual iteration —
// works with ?demo too (LAYOUT placements landing on water simply fail).
const devMapSeed = () => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  // Lowercased: generated seeds are stored lowercase but the TopBar displays
  // them uppercase, so a pasted seed would otherwise hash to a different map.
  return new URLSearchParams(window.location.search).get("map")?.toLowerCase() ?? null;
};

const createInitialState = (runSeed?: string) => {
  // Demo mode is for stable screenshots — fix the seed so the city name (and any
  // future seed-driven visuals) don't change on every refresh.
  const seed = isDemo() ? "demo" : runSeed ?? generateSeed();
  return {
    seed,
    // Demo runs on DEMO_MAP_SEED — an inland river down the east, clear of the
    // hand-placed west-bank city (see demoLayout.ts). ?map= still overrides.
    mapSeed: devMapSeed() ?? (isDemo() ? DEMO_MAP_SEED : seed),
    cityName: pickCityName(seed),
    florins: STARTING_FLORINS,
    inspiration: 0,
    prestige: 0,
    population: 0,
    artists: [] as Artist[],
    artworks: [] as Artwork[],
    commissions: [] as Commission[],
    favor: {} as Record<string, number>,
    materials: { ...EMPTY_POOLS } as MaterialPools,
    fundedBuilds: [] as string[],
    renaissanceReached: false,
    hoveredTileKey: null as string | null,
    razeTarget: null as string | null,
    offerAlert: null as string | null,
    denounceAlert: null as string | null,
    nowPlaying: null as string | null,
    inspectTarget: null as { key: string; slot?: number } | null,
    map: { tiles: {}, selectedBuilding: null } as MapState,
    time: { tickCount: 0 },
    paused: false,
    tickInterval: BASE_TICK_INTERVAL,
    musicVolume: 0.4,
    sfxVolume: 0.5,
    ambienceVolume: 0.5,
  };
};

const initializer: StateCreator<GameState> = (set, get) => ({
  ...createInitialState(),
  setCityName: (value) => set(() => ({ cityName: value })),
  addFlorins: (amount: number) => set((s) => ({ florins: s.florins + amount })),
  setFlorins: (value: number) => set(() => ({ florins: value })),
  setPopulation: (value: number) => set(() => ({ population: value })),
  dismissRenaissance: () => set(() => ({ renaissanceReached: true })),
  setHoveredTile: (key) => set(() => ({ hoveredTileKey: key })),
  setRazeTarget: (key) => set(() => ({ razeTarget: key })),
  setInspectTarget: (target) => set(() => ({ inspectTarget: target })),
  setOfferAlert: (id) => set(() => ({ offerAlert: id })),
  setDenounceAlert: (name) => set(() => ({ denounceAlert: name })),
  setNowPlaying: (title) => set(() => ({ nowPlaying: title })),

  displayArtwork: (artworkId, hostKey, slot) =>
    set((s) => {
      const artwork = s.artworks.find((w) => w.id === artworkId);
      if (!canDisplayWork(artwork, hostKey, slot, s.map.tiles, s.artworks)) return s;
      playSfx("display");
      return {
        artworks: s.artworks.map((w) =>
          w === artwork ? { ...w, displayedAt: { key: hostKey, slot } } : w
        ),
      };
    }),

  recallArtwork: (artworkId) =>
    set((s) => {
      const artwork = s.artworks.find((w) => w.id === artworkId && w.displayedAt);
      if (!artwork) return s;
      playSfx("display");
      return {
        artworks: s.artworks.map((w) => (w === artwork ? { ...w, displayedAt: undefined } : w)),
      };
    }),

  tick: () =>
    set((s) => {
      const next = advanceTick(s);
      // Arrival card for a freshly offered commission (reopened ones keep
      // their id, so they don't re-alert); overwrite on rare doubles.
      const newOffer = next.commissions.find(
        (c) => !c.workshopKey && !s.commissions.some((p) => p.id === c.id)
      );
      if (newOffer) playSfx("offer");
      if (next.denounced[0]) playSfx("denounce");
      // A grown artwork list = a completed work paid out this tick.
      if (next.artworks.length > s.artworks.length) playSfx("payout");
      return {
        florins: next.florins,
        inspiration: next.inspiration,
        prestige: next.prestige,
        population: next.population,
        artists: next.artists,
        artworks: next.artworks,
        commissions: next.commissions,
        favor: next.favor,
        materials: next.materials,
        fundedBuilds: next.fundedBuilds,
        offerAlert: newOffer ? newOffer.id : s.offerAlert,
        denounceAlert: next.denounced[0] ?? s.denounceAlert,
        time: { tickCount: next.tickCount },
        map: next.tiles === s.map.tiles ? s.map : { ...s.map, tiles: next.tiles },
      };
    }),

  // seed: player-supplied (or archetype-picked) run seed; omitted = random.
  resetGame: (seed) => set(createInitialState(seed)),

  assignCommission: (commissionId, workshopKey) =>
    set((s) => {
      const commission = s.commissions.find((c) => c.id === commissionId);
      if (!commission) return s;
      // Founder = first artist homed at the workshop; work is tracked on them.
      const founder = s.artists.find((a) => a.homeTileKey === workshopKey);
      // Gate on the commission's own material (marble vs bronze), not the type.
      const material = commissionMaterial(commission);
      const available = material ? s.materials[material] : Infinity;
      if (!canAssignCommission(commission, founder, s.map.tiles, available)) return s;
      playSfx("assign");
      // Stock is spent up front, so assigned work never stalls on materials.
      // ponytail: no refund when a raze reopens the commission — spent is spent.
      const cost = commissionMaterialCost(commission);
      return {
        artists: s.artists.map((a) => (a === founder ? { ...a, workProgress: 0 } : a)),
        commissions: s.commissions.map((c) => (c === commission ? { ...c, workshopKey } : c)),
        ...(material && cost > 0
          ? { materials: { ...s.materials, [material]: s.materials[material] - cost } }
          : {}),
      };
    }),

  declineCommission: (commissionId) =>
    set((s) => {
      const commission = s.commissions.find((c) => c.id === commissionId);
      if (!commission || commission.workshopKey) return s;
      // Same clamp + denunciation crossing as the tick's expiry slights.
      const { favor, denounced } = applyFavor(s.favor, commission.requester, -FAVOR_SLIGHT);
      playSfx(denounced ? "denounce" : "decline");
      return {
        commissions: s.commissions.filter((c) => c !== commission),
        favor,
        offerAlert: s.offerAlert === commissionId ? null : s.offerAlert,
        ...(denounced
          ? {
              prestige: Math.max(0, s.prestige - DENOUNCE_PRESTIGE),
              denounceAlert: commission.requester,
            }
          : {}),
      };
    }),

  togglePause: () => {
    playSfx("toggle");
    set((s) => ({
      paused: !s.paused,
    }));
  },

  setPaused: (value) =>
    set(() => ({
      paused: value,
    })),

  setTickInterval: (value) => {
    playSfx("toggle");
    set(() => ({
      tickInterval: Math.max(100, value),
    }));
  },

  setMusicVolume: (value) =>
    set(() => ({
      musicVolume: Math.min(1, Math.max(0, value)),
    })),

  setSfxVolume: (value) =>
    set(() => ({
      sfxVolume: Math.min(1, Math.max(0, value)),
    })),

  setAmbienceVolume: (value) =>
    set(() => ({
      ambienceVolume: Math.min(1, Math.max(0, value)),
    })),

  setSelectedBuilding: (id) => {
    if (id) playSfx("select"); // null = cancel/deselect, not a pick
    set((s) => ({ map: { ...s.map, selectedBuilding: id }, razeTarget: null, inspectTarget: null }));
  },

  placeTile: (position, buildingId, rotation) => get().placeTiles([position], buildingId, rotation),

  placeTiles: (positions, buildingId, rotation) => {
    let placed = false;
    set((s) => {
      const plan = planPlacement(s, positions, buildingId, rotation);
      if (!plan) return s;
      const { metadata, cells, freeCells, totalCost, materialCost } = plan;
      const materialsSpent = Object.entries(materialCost) as [Material, number][];
      const type = metadata.type;
      const workersRequired = metadata.workersRequired ?? 0;

      // The city teaches architects: XP per florin spent, computed against
      // pre-placement tiles/artists so a studio never trains on its own
      // construction and new founders are excluded.
      const activeStudios = new Set<string>();
      for (const [k, t, m] of origins(s.map.tiles)) {
        if (t.isActive && m.artistType === "architect") activeStudios.add(k);
      }
      const trained = trainOnConstruction(s.artists, activeStudios, totalCost);

      const newTiles = { ...s.map.tiles };
      const founders: Artist[] = [];

      for (const position of positions) {
        const originX = position.x;
        const originY = position.y;
        const originVector: GridPos = { x: originX, y: originY };

        // Workshops open with a founding artist. Guard: demolish + rebuild on the
        // same origin within one tick leaves the old crew homed there (prune lags
        // a tick) — don't spawn a second founder into an occupied key.
        if (metadata.artistCapacity != null) {
          const key = `${originX},${originY}`;
          if (!s.artists.some((a) => a.homeTileKey === key)) {
            founders.push(createArtist(key, metadata.artistType ?? "painter"));
          }
        }

        for (const offset of cells) {
          const cellX = originX + offset.x;
          const cellY = originY + offset.y;
          const key = `${cellX},${cellY}`;
          if (!freeCells.has(key)) continue; // overlapped cell keeps its owner
          newTiles[key] = {
            buildingId,
            type,
            position: { x: cellX, y: cellY },
            origin: { ...originVector },
            isOrigin: offset.x === 0 && offset.y === 0,
            isActive: workersRequired === 0,
            rotation,
            workers: 0,
            builtTick: s.time.tickCount,
          };
        }
      }

      placed = true;
      return {
        florins: s.florins - totalCost,
        // Construction materials are spent up front, like commission stock —
        // no refund on raze (the salvage is florins only).
        ...(materialsSpent.length
          ? {
              materials: {
                ...s.materials,
                ...Object.fromEntries(materialsSpent.map(([m, amt]) => [m, s.materials[m] - amt])),
              },
            }
          : {}),
        ...(metadata.prestigeOnBuild
          ? { prestige: s.prestige + metadata.prestigeOnBuild * positions.length }
          : {}),
        // A funded blueprint build consumes its token (one placement each).
        ...(metadata.commissionOnly
          ? {
              fundedBuilds: s.fundedBuilds.filter(
                (_, i) => i !== s.fundedBuilds.indexOf(buildingId)
              ),
            }
          : {}),
        ...(founders.length || trained !== s.artists
          ? { artists: [...trained, ...founders] }
          : {}),
        map: {
          ...s.map,
          tiles: newTiles,
        }
      };
    });
    return placed;
  },

  removeTile: (position) =>
    set((s) => {
      const next = razeBuilding(s, position);
      if (!next) return s;
      playSfx("raze");
      return {
        florins: next.florins,
        artists: next.artists,
        artworks: next.artworks,
        commissions: next.commissions,
        map: { ...s.map, tiles: next.tiles },
      };
    }),

  getTileAt: (position) => {
    const state = get();
    return state.map.tiles[`${position.x},${position.y}`];
  },

  getHousing: () => {
    const tiles = get().map.tiles;
    const counts = computeDisplaySummary(tiles, get().artworks).counts;
    return computeCityMetrics(tiles, undefined, counts, get().population).housing;
  },

  getCalendarLabel: () => formatMonth(get().time.tickCount),
});

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export const formatMonth = (tick: number) =>
  `${MONTH_NAMES[tick % 12]} ${1400 + Math.floor(tick / 12)}`;

// ponytail: demo mode gets a black-hole storage so /?demo never reads or clobbers the real save
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const isDemo = () =>
  typeof window !== "undefined" && window.location.search.includes("demo");

export const useGameStore = create<GameState>()(
  persist(initializer, {
    name: "patronage-save",
    // v10: construction pools (timber/stone) seeded empty on old saves.
    // v9: materials became accumulating stock — pools start empty. v8:
    // per-faction favor added, seeded from completed works. v7: XP ×100.
    // v6: seeded map (water layer) added — the first *preserving* migration:
    // pre-water saves keep their city and get mapSeed: null (forever dry,
    // since a newly seeded river would collide with their buildings).
    // (v5: cathedral/tavern footprints grew — stamped tile spans no longer
    // matched the metadata, so saves were discarded; v4: grid subdivided 2×;
    // v3: commissions replaced free-play artworks; v2: footprints rescaled —
    // same discard policy.)
    version: SAVE_VERSION,
    migrate: migrateSave,
    // SSR: hydrate manually from the game route's client effect
    skipHydration: true,
    storage: createJSONStorage(() => (isDemo() ? noopStorage : localStorage)),
    partialize: (s) => ({
      seed: s.seed,
      mapSeed: s.mapSeed,
      cityName: s.cityName,
      florins: s.florins,
      inspiration: s.inspiration,
      prestige: s.prestige,
      population: s.population,
      artists: s.artists,
      artworks: s.artworks,
      commissions: s.commissions,
      favor: s.favor,
      materials: s.materials,
      // Absent on old saves hydrates to the initial [] — no migration.
      fundedBuilds: s.fundedBuilds,
      // Absent on old saves reads falsy = not yet celebrated — no migration.
      renaissanceReached: s.renaissanceReached,
      map: { tiles: s.map.tiles, selectedBuilding: null },
      time: s.time,
      tickInterval: s.tickInterval,
      // Absent on old saves hydrate to their initial values — no migration.
      musicVolume: s.musicVolume,
      sfxVolume: s.sfxVolume,
      ambienceVolume: s.ambienceVolume,
    }),
  }),
);
