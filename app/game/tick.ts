import { BUILDING_METADATA_BY_ID, origins } from "./buildings.ts";
import { computePlazaConnectivity } from "./city/connectivity.ts";
import {
  DENOUNCE_PRESTIGE,
  FAVOR_PER_WORK,
  FAVOR_SLIGHT,
  INCOME_DIMINISHING_RETURNS,
  POPULATION_DRIFT_PER_MONTH,
} from "./constants.ts";
import { computeDisplaySummary, displayBoost } from "./art/display.ts";
import type { TileMap } from "./grid.ts";
import { addProduction, materialCaps, type MaterialPools } from "./art/materials.ts";
import { computeCityMetrics, supplierRate } from "./city/metrics.ts";
import { formedPlazaInspiration } from "./city/gathering.ts";
import {
  accrueDisciplineXp,
  applyXpFloor,
  maybeArriveArtist,
  progressArtworks,
  type DisciplineXp,
  type WorkshopSlot,
} from "./art/artists.ts";
import { applyFavor, maybeOfferCommission, reconcileCommissions } from "./art/commissions.ts";
import { plazaBoost } from "./city/traffic.ts";
import type { Artist, Artwork, BuildingMetadata, Commission, Material } from "./types.ts";
import { allocateWorkers, staffingEfficiency, type StaffableBuilding } from "./city/workers.ts";

export interface TickSnapshot {
  mapSeed: string | null; // formed freeform plazas derive from it (gathering.ts)
  florins: number;
  inspiration: number;
  prestige: number;
  population: number;
  artists: Artist[];
  artworks: Artwork[];
  commissions: Commission[];
  favor: Record<string, number>;
  materials: MaterialPools;
  fundedBuilds: string[];
  disciplineXp: DisciplineXp;
  time: { tickCount: number };
  map: { tiles: TileMap };
}

export interface TickTransition {
  florins: number;
  inspiration: number;
  prestige: number;
  population: number;
  artists: Artist[];
  artworks: Artwork[];
  commissions: Commission[];
  favor: Record<string, number>;
  materials: MaterialPools;
  fundedBuilds: string[]; // grows when a blueprint commission completes
  disciplineXp: DisciplineXp; // city tradition pools, fed by this tick's completions
  denounced: string[]; // factions that crossed into affronted this tick
  tickCount: number;
  tiles: TileMap;
}

/** Advance the simulation by one month without depending on the Zustand adapter. */
export function advanceTick(
  state: TickSnapshot,
  rng: () => number = Math.random
): TickTransition {
  const tiles = state.map.tiles;

  const staffables: StaffableBuilding[] = [];
  for (const [key, , metadata] of origins(tiles)) {
    staffables.push({
      key,
      type: metadata.type,
      workersRequired: metadata.workersRequired ?? 0,
      maxWorkers: Math.max(metadata.workersRequired ?? 0, metadata.maxWorkers ?? 0),
    });
  }
  const allocation = allocateWorkers(staffables, state.population);

  let tilesChanged = false;
  const updatedTiles: TileMap = {};
  for (const [key, tile] of Object.entries(tiles)) {
    const required = BUILDING_METADATA_BY_ID[tile.buildingId]?.workersRequired ?? 0;
    const workers = required > 0 ? allocation.get(`${tile.origin.x},${tile.origin.y}`) ?? 0 : 0;
    const isActive = workers >= required;
    if (tile.workers === workers && tile.isActive === isActive) {
      updatedTiles[key] = tile;
    } else {
      updatedTiles[key] = { ...tile, workers, isActive };
      tilesChanged = true;
    }
  }

  const connected = computePlazaConnectivity(updatedTiles, state.mapSeed);
  // Start-of-month population feeds the foot-traffic factor — consistent with
  // the computeCityMetrics call below.
  const boostOf = (key: string, metadata: BuildingMetadata) =>
    plazaBoost(metadata, key, connected.get(key) ?? 0, updatedTiles, state.population);

  // Displayed works: a per-tick trickle plus a per-host effectiveness boost.
  const display = computeDisplaySummary(updatedTiles, state.artworks);

  const { housing, amenities } = computeCityMetrics(
    updatedTiles,
    state.mapSeed,
    connected,
    display.counts,
    state.population
  );
  const populationCap = Math.min(housing, amenities);
  const population =
    state.population + Math.sign(populationCap - state.population) * POPULATION_DRIFT_PER_MONTH;

  // Rent tracks tenants: empty houses pay proportionally less, so total rent is
  // bounded by population (itself capped by amenities) instead of raw house count.
  const occupancy = housing > 0 ? Math.min(1, population / housing) : 0;

  // Diminishing returns on duplicate non-housing florin-generators (markets,
  // future trade buildings). Oldest of each kind keeps full output; the Nth
  // (by build order) yields DR^N.
  const drByKey = new Map<string, number>();
  const genByBuilding = new Map<string, { key: string; builtTick: number }[]>();
  for (const [key, tile, m] of origins(updatedTiles)) {
    if (!tile.isActive) continue;
    if (!m.generates?.income || m.housing) continue; // housing handled by occupancy
    const list = genByBuilding.get(tile.buildingId) ?? [];
    list.push({ key, builtTick: tile.builtTick ?? 0 });
    genByBuilding.set(tile.buildingId, list);
  }
  for (const list of genByBuilding.values()) {
    list.sort((a, b) => a.builtTick - b.builtTick || a.key.localeCompare(b.key));
    list.forEach((g, i) => drByKey.set(g.key, INCOME_DIMINISHING_RETURNS ** i));
  }

  let florinDelta = 0;
  let inspirationDelta = 0;
  const produced: { material: Material; amount: number }[] = [];
  for (const [key, tile, metadata] of origins(updatedTiles)) {
    if (!tile.isActive) continue;
    // Supplier output rides staffing and plaza connection like any generator,
    // but takes no diminishing returns: more suppliers must never mean less
    // stock (principle 6). Escalating build cost already prices duplicates.
    if (metadata.supplies) {
      produced.push({
        material: metadata.supplies.material,
        amount: supplierRate(
          metadata,
          tile.workers,
          key,
          connected.get(key) ?? 0,
          updatedTiles,
          state.population
        ),
      });
    }
    if (!metadata.generates) continue;
    const staffing = staffingEfficiency(
      metadata.workersRequired ?? 0,
      metadata.maxWorkers ?? 0,
      tile.workers
    );
    const efficiency =
      staffing * boostOf(key, metadata) * displayBoost(display.counts.get(key) ?? 0);
    const incomeScale = metadata.housing ? occupancy : (drByKey.get(key) ?? 1);
    florinDelta += (metadata.generates.income ?? 0) * efficiency * incomeScale;
    inspirationDelta += (metadata.generates.inspiration ?? 0) * efficiency;
  }
  // Displayed-work trickle (non-church hosts). Added before rounding so it feeds
  // both the same-tick inspiration below and the returned total identically.
  inspirationDelta += display.inspiration;
  // Formed freeform plazas: flat per plaza like the premade ones (workerless,
  // boost-free), organic ones slightly hotter (gathering.ts).
  inspirationDelta += formedPlazaInspiration(updatedTiles, state.mapSeed);

  const inspiration = state.inspiration + Math.round(inspirationDelta);
  const isWorkshop = (key: string) => {
    const tile = updatedTiles[key];
    return !!tile?.isOrigin && BUILDING_METADATA_BY_ID[tile.buildingId]?.artistCapacity != null;
  };
  let artists = state.artists.filter((artist) => isWorkshop(artist.homeTileKey));
  let artistsChanged = artists.length !== state.artists.length;

  const workshops: WorkshopSlot[] = [];
  for (const [key, tile, metadata] of origins(updatedTiles)) {
    if (metadata.artistCapacity == null) continue;
    workshops.push({
      key,
      capacity: metadata.artistCapacity,
      artistType: metadata.artistType ?? "painter",
      isActive: tile.isActive,
      builtTick: tile.builtTick ?? 0,
    });
  }
  const arrival = maybeArriveArtist(
    workshops,
    artists,
    inspiration,
    state.time.tickCount,
    rng,
    state.disciplineXp
  );
  if (arrival) {
    artists = [...artists, arrival];
    artistsChanged = true;
  }

  const workshopKeys = new Set(workshops.map((workshop) => workshop.key));
  const reconciled = reconcileCommissions(
    state.commissions,
    workshopKeys,
    state.time.tickCount
  );
  let commissions = reconciled.commissions;
  let commissionsChanged = reconciled.changed;

  // Favor: expired offers slight, completions honor (clamped 0–100). Crossing
  // down through FAVOR_AFFRONTED fires the one-time denunciation; it re-arms
  // only by recovering above the line, since only a fresh crossing counts.
  let favor = state.favor;
  const denounced: string[] = [];
  const moveFavor = (name: string, delta: number) => {
    const moved = applyFavor(favor, name, delta);
    favor = moved.favor;
    if (moved.denounced) denounced.push(name);
  };
  for (const name of reconciled.expiredRequesters) moveFavor(name, -FAVOR_SLIGHT);

  const offer = maybeOfferCommission(
    commissions,
    artists,
    state.time.tickCount,
    rng,
    updatedTiles,
    favor
  );
  if (offer) {
    commissions = [...commissions, offer];
    commissionsChanged = true;
  }

  const work = progressArtworks(
    artists,
    workshops,
    commissions,
    inspiration,
    state.time.tickCount,
    connected,
    display.counts
  );
  if (work.changed) {
    artists = work.artists;
    artistsChanged = true;
  }
  let fundedBuilds = state.fundedBuilds;
  if (work.finishedCommissionIds.length > 0) {
    const finished = new Set(work.finishedCommissionIds);
    // A finished blueprint commission funds its structure: the token that lets
    // the player place it once at 0 florins (construction materials still due).
    const unlocked = commissions
      .filter((c) => finished.has(c.id) && c.building)
      .map((c) => c.building!);
    if (unlocked.length > 0) fundedBuilds = [...fundedBuilds, ...unlocked];
    commissions = commissions.filter((commission) => !finished.has(commission.id));
    commissionsChanged = true;
  }
  for (const w of work.completed) {
    if (w.requester) moveFavor(w.requester, FAVOR_PER_WORK);
  }

  // Bank completions into the city's tradition pools, then lift everyone to
  // the floor — unconditionally, since pools can also have grown from a
  // placement since last tick (construction feeds pool.architect in placeTiles).
  const disciplineXp = accrueDisciplineXp(state.disciplineXp, work.completed);
  const floored = applyXpFloor(artists, disciplineXp);
  if (floored !== artists) {
    artists = floored;
    artistsChanged = true;
  }

  return {
    florins: state.florins + Math.round(florinDelta) + work.florins,
    inspiration: state.inspiration + Math.round(inspirationDelta),
    prestige: Math.max(
      0,
      state.prestige + work.prestige - DENOUNCE_PRESTIGE * denounced.length
    ),
    population,
    artists: artistsChanged ? artists : state.artists,
    artworks: work.completed.length ? [...state.artworks, ...work.completed] : state.artworks,
    commissions: commissionsChanged ? commissions : state.commissions,
    favor,
    materials: addProduction(state.materials, produced, materialCaps(updatedTiles)),
    fundedBuilds,
    disciplineXp,
    denounced,
    tickCount: state.time.tickCount + 1,
    tiles: tilesChanged ? updatedTiles : tiles,
  };
}
