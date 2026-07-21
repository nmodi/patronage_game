import { create } from "zustand";
import type { StateCreator } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { Artist, Artwork, Commission } from "~/game/types";
import type { BuildingId } from "~/game/buildings";
import type { GridPos, Tile, TileMap } from "~/game/grid";
import { planPlacement } from "~/game/placementRules";
import { deriveSimTiles } from "~/game/roadRaster";
import type { RoadSegment, WorldPoint } from "~/game/roadSegment";
import { pointToSegmentDistance, segmentLength } from "~/game/roadSegment";
import { planSegmentPlacement } from "~/game/roadSegmentPlan";
import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { RAZE_SALVAGE_FRACTION } from "~/game/constants";
import { canAssignCommission } from "~/game/commissions";
import { canDisplayWork } from "~/game/display";
import { createArtist } from "~/game/artists";
import { generateSeed, pickCityName } from "~/game/seed";
import { DEMO_MAP_SEED } from "~/game/demoLayout";
import { commissionMaterial, getSupply } from "~/game/materials";
import { computeDisplaySummary } from "~/game/display";
import { computeCityMetrics } from "~/game/metrics";
import { razeBuilding } from "~/game/raze";
import { migrateSave, SAVE_VERSION } from "~/game/saveMigration";
import { advanceTick } from "~/game/tick";
import { BASE_TICK_INTERVAL, STARTING_FLORINS } from "~/game/constants";

// The demolition tool rides the building-selection slot: camera-drag detach,
// grid visibility, and the palette's cancel keys all treat it like placement.
export const RAZE_TOOL = "raze" as const;

export interface MapState {
  tiles: TileMap;  // Key is "x,y"
  // Freeform (any-angle) roads, laid as world-space segments. Persisted as the
  // geometry/edit source of truth; the sim reads them rasterized into cells via
  // deriveSimTiles (roadRaster.ts). Empty on grid-only and legacy saves.
  roads: RoadSegment[];
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
  assignCommission: (commissionId: string, workshopKey: string) => void;
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
  setSelectedBuilding: (id: BuildingId | typeof RAZE_TOOL | null) => void;
  placeTile: (position: GridPos, buildingId: BuildingId, rotation?: number) => boolean;
  placeTiles: (positions: GridPos[], buildingId: BuildingId, rotation?: number) => boolean;
  removeTile: (position: GridPos) => void;
  // Freeform roads: lay a world-space segment, or raze the one nearest a point.
  placeRoadSegment: (segment: RoadSegment) => boolean;
  removeRoadSegmentAt: (point: WorldPoint) => void;
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
    renaissanceReached: false,
    hoveredTileKey: null as string | null,
    razeTarget: null as string | null,
    inspectTarget: null as { key: string; slot?: number } | null,
    map: { tiles: {}, roads: [], selectedBuilding: null } as MapState,
    time: { tickCount: 0 },
    paused: false,
    tickInterval: BASE_TICK_INTERVAL,
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

  displayArtwork: (artworkId, hostKey, slot) =>
    set((s) => {
      const artwork = s.artworks.find((w) => w.id === artworkId);
      if (!canDisplayWork(artwork, hostKey, slot, s.map.tiles, s.artworks)) return s;
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
      return {
        artworks: s.artworks.map((w) => (w === artwork ? { ...w, displayedAt: undefined } : w)),
      };
    }),

  tick: () =>
    set((s) => {
      const next = advanceTick(s);
      return {
        florins: next.florins,
        inspiration: next.inspiration,
        prestige: next.prestige,
        population: next.population,
        artists: next.artists,
        artworks: next.artworks,
        commissions: next.commissions,
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
      const supply = material
        ? getSupply(s.map.tiles, s.artists, s.commissions)[material]
        : undefined;
      if (!canAssignCommission(commission, founder, s.map.tiles, supply)) return s;
      return {
        artists: s.artists.map((a) => (a === founder ? { ...a, workProgress: 0 } : a)),
        commissions: s.commissions.map((c) => (c === commission ? { ...c, workshopKey } : c)),
      };
    }),

  togglePause: () =>
    set((s) => ({
      paused: !s.paused,
    })),

  setPaused: (value) =>
    set(() => ({
      paused: value,
    })),

  setTickInterval: (value) =>
    set(() => ({
      tickInterval: Math.max(100, value),
    })),

  setSelectedBuilding: (id) =>
    set((s) => ({ map: { ...s.map, selectedBuilding: id }, razeTarget: null, inspectTarget: null })),

  placeTile: (position, buildingId, rotation) => get().placeTiles([position], buildingId, rotation),

  placeTiles: (positions, buildingId, rotation) => {
    let placed = false;
    set((s) => {
      // Validate against the sim view so a building can't overwrite a freeform
      // road cell (roads block placement, exactly like grid roads in `tiles`).
      const plan = planPlacement(
        { florins: s.florins, mapSeed: s.mapSeed, map: { tiles: deriveSimTiles(s.map.tiles, s.map.roads) } },
        positions,
        buildingId,
        rotation
      );
      if (!plan) return s;
      const { metadata, cells, freeCells, totalCost } = plan;
      const type = metadata.type;
      const workersRequired = metadata.workersRequired ?? 0;

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
        ...(metadata.prestigeOnBuild
          ? { prestige: s.prestige + metadata.prestigeOnBuild * positions.length }
          : {}),
        ...(founders.length ? { artists: [...s.artists, ...founders] } : {}),
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
      return {
        florins: next.florins,
        artists: next.artists,
        artworks: next.artworks,
        commissions: next.commissions,
        map: { ...s.map, tiles: next.tiles },
      };
    }),

  placeRoadSegment: (segment) => {
    let placed = false;
    set((s) => {
      const plan = planSegmentPlacement(
        { florins: s.florins, mapSeed: s.mapSeed, map: { tiles: s.map.tiles, roads: s.map.roads } },
        segment
      );
      if (!plan || plan.newCells.length === 0) return s;
      placed = true;
      return {
        florins: s.florins - plan.totalCost,
        map: { ...s.map, roads: [...s.map.roads, segment] },
      };
    });
    return placed;
  },

  removeRoadSegmentAt: (point) =>
    set((s) => {
      // Nearest segment whose ribbon the point falls within.
      let bestIndex = -1;
      let bestDist = Infinity;
      for (let i = 0; i < s.map.roads.length; i += 1) {
        const seg = s.map.roads[i];
        const dist = pointToSegmentDistance(point.x, point.z, seg);
        if (dist <= seg.width / 2 && dist < bestDist) {
          bestIndex = i;
          bestDist = dist;
        }
      }
      if (bestIndex < 0) return s;
      const seg = s.map.roads[bestIndex];
      const roads = s.map.roads.filter((_, i) => i !== bestIndex);
      // Flat-priced roads: salvage a fraction of the base per world-length cell.
      const metadata = BUILDING_METADATA_BY_ID[seg.buildingId];
      const cellLength = Math.max(1, Math.round(segmentLength(seg) / 0.5));
      const salvage = metadata
        ? Math.floor(metadata.baseCost * cellLength * RAZE_SALVAGE_FRACTION)
        : 0;
      return { florins: s.florins + salvage, map: { ...s.map, roads } };
    }),

  getTileAt: (position) => {
    const state = get();
    return state.map.tiles[`${position.x},${position.y}`];
  },

  getHousing: () => {
    const { tiles, roads } = get().map;
    const counts = computeDisplaySummary(tiles, get().artworks).counts;
    // Sim view so the housing plaza-connection bonus flows through freeform
    // roads; display counts read canonical tiles (roads carry no displays).
    const simTiles = deriveSimTiles(tiles, roads);
    return computeCityMetrics(simTiles, undefined, counts, get().population).housing;
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
      // Absent on old saves reads falsy = not yet celebrated — no migration.
      renaissanceReached: s.renaissanceReached,
      map: { tiles: s.map.tiles, roads: s.map.roads, selectedBuilding: null },
      time: s.time,
      tickInterval: s.tickInterval,
    }),
  }),
);
