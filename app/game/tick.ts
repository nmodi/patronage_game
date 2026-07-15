import { BUILDING_METADATA_BY_ID } from "./buildings.ts";
import { computePlazaConnectivity, PLAZA_CONNECTION_BONUS } from "./connectivity.ts";
import { INCOME_DIMINISHING_RETURNS, POPULATION_DRIFT_PER_MONTH } from "./constants.ts";
import { computeDisplaySummary, displayBoost } from "./display.ts";
import type { TileMap } from "./grid.ts";
import { assignedMaterials, getSupply, MATERIAL_BY_ARTIST_TYPE } from "./materials.ts";
import { computeCityMetrics } from "./metrics.ts";
import { maybeArriveArtist, progressArtworks, type WorkshopSlot } from "./artists.ts";
import { maybeOfferCommission, reconcileCommissions } from "./commissions.ts";
import type { Artist, Artwork, Commission } from "./types.ts";
import { allocateWorkers, staffingEfficiency, type StaffableBuilding } from "./workers.ts";

export interface TickSnapshot {
  florins: number;
  inspiration: number;
  prestige: number;
  population: number;
  artists: Artist[];
  artworks: Artwork[];
  commissions: Commission[];
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
  for (const tile of Object.values(tiles)) {
    if (!tile.isOrigin) continue;
    const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
    if (!metadata) continue;
    staffables.push({
      key: `${tile.position.x},${tile.position.y}`,
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

  // Working workshops beyond supplier capacity stall; oldest workshops retain
  // their slots. Material blocking shares the normal inactive feedback path.
  const supply = getSupply(updatedTiles, state.artists, state.commissions);
  const workshopMaterials = assignedMaterials(state.commissions);
  const blockedOrigins = new Set<string>();
  for (const artist of state.artists) {
    if (artist.workProgress == null) continue;
    const material =
      workshopMaterials.get(artist.homeTileKey) ?? MATERIAL_BY_ARTIST_TYPE[artist.type];
    const status = material ? supply[material] : undefined;
    if (status && !status.allowed.has(artist.homeTileKey)) {
      blockedOrigins.add(artist.homeTileKey);
    }
  }
  if (blockedOrigins.size > 0) {
    for (const [key, tile] of Object.entries(updatedTiles)) {
      if (!tile.isActive || !blockedOrigins.has(`${tile.origin.x},${tile.origin.y}`)) continue;
      updatedTiles[key] = { ...tile, isActive: false };
      tilesChanged = true;
    }
  }

  const connected = computePlazaConnectivity(updatedTiles);
  const plazaBoost = (key: string) =>
    1 + PLAZA_CONNECTION_BONUS * (connected.get(key) ?? 0);

  // Displayed works: a per-tick trickle plus a per-host effectiveness boost.
  const display = computeDisplaySummary(updatedTiles, state.artworks);

  const { housing, amenities } = computeCityMetrics(updatedTiles, connected, display.counts);
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
  for (const [key, tile] of Object.entries(updatedTiles)) {
    if (!tile.isOrigin || !tile.isActive) continue;
    const m = BUILDING_METADATA_BY_ID[tile.buildingId];
    if (!m?.generates?.income || m.housing) continue; // housing handled by occupancy
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
  for (const [key, tile] of Object.entries(updatedTiles)) {
    if (!tile.isOrigin || !tile.isActive) continue;
    const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
    if (!metadata?.generates) continue;
    const efficiency =
      staffingEfficiency(
        metadata.workersRequired ?? 0,
        metadata.maxWorkers ?? 0,
        tile.workers
      ) * plazaBoost(key) * displayBoost(display.counts.get(key) ?? 0);
    const incomeScale = metadata.housing ? occupancy : (drByKey.get(key) ?? 1);
    florinDelta += (metadata.generates.income ?? 0) * efficiency * incomeScale;
    inspirationDelta += (metadata.generates.inspiration ?? 0) * efficiency;
  }
  // Displayed-work trickle (non-church hosts). Added before rounding so it feeds
  // both the same-tick inspiration below and the returned total identically.
  inspirationDelta += display.inspiration;

  const inspiration = state.inspiration + Math.round(inspirationDelta);
  const isWorkshop = (key: string) => {
    const tile = updatedTiles[key];
    return !!tile?.isOrigin && BUILDING_METADATA_BY_ID[tile.buildingId]?.artistCapacity != null;
  };
  let artists = state.artists.filter((artist) => isWorkshop(artist.homeTileKey));
  let artistsChanged = artists.length !== state.artists.length;

  const workshops: WorkshopSlot[] = [];
  for (const tile of Object.values(updatedTiles)) {
    if (!tile.isOrigin) continue;
    const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
    if (metadata?.artistCapacity == null) continue;
    workshops.push({
      key: `${tile.position.x},${tile.position.y}`,
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
    rng
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
  const offer = maybeOfferCommission(commissions, artists, state.time.tickCount, rng);
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
  if (work.finishedCommissionIds.length > 0) {
    const finished = new Set(work.finishedCommissionIds);
    commissions = commissions.filter((commission) => !finished.has(commission.id));
    commissionsChanged = true;
  }

  return {
    florins: state.florins + Math.round(florinDelta) + work.florins,
    inspiration: state.inspiration + Math.round(inspirationDelta),
    prestige: state.prestige + work.prestige + display.prestige,
    population,
    artists: artistsChanged ? artists : state.artists,
    artworks: work.completed.length ? [...state.artworks, ...work.completed] : state.artworks,
    commissions: commissionsChanged ? commissions : state.commissions,
    tickCount: state.time.tickCount + 1,
    tiles: tilesChanged ? updatedTiles : tiles,
  };
}
