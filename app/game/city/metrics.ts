import { origins } from "../buildings.ts";
import { BASE_POPULATION_CAP } from "../constants.ts";
import { computePlazaConnectivity } from "./connectivity.ts";
import { displayBoost } from "../art/display.ts";
import type { TileMap } from "../grid.ts";
import type { BuildingMetadata } from "../types.ts";
import { plazaBoost } from "./traffic.ts";
import { staffingEfficiency } from "./workers.ts";

export interface CityMetrics {
  housing: number;
  amenities: number;
}

/** A supplier's monthly output: rate × staffing × plaza boost. One source for
 * the tick's generation loop, the materials rail, and the building tooltip.
 * No display boost (the tick applies that to `generates` only) and no
 * diminishing returns — more suppliers must never mean less stock
 * (principle 6). */
export function supplierRate(
  metadata: BuildingMetadata,
  workers: number,
  originKey: string,
  strength: number,
  tiles: TileMap,
  population: number
): number {
  if (!metadata.supplies) return 0;
  return (
    metadata.supplies.rate *
    staffingEfficiency(metadata.workersRequired ?? 0, metadata.maxWorkers ?? 0, workers) *
    plazaBoost(metadata, originKey, strength, tiles, population)
  );
}

/** Population caps derived from the current map, using one shared plaza calculation. */
export function computeCityMetrics(
  tiles: TileMap,
  connected = computePlazaConnectivity(tiles),
  displayCounts?: Map<string, number>, // host origin key → displayed-work count
  population = 0 // feeds the foot-traffic factor; omitted = traffic muted
): CityMetrics {
  let housing = 0;
  let amenities = BASE_POPULATION_CAP;

  for (const [key, tile, metadata] of origins(tiles)) {
    const boost =
      plazaBoost(metadata, key, connected.get(key) ?? 0, tiles, population) *
      displayBoost(displayCounts?.get(key) ?? 0);
    housing += Math.round((metadata.housing ?? 0) * boost);
    if (tile.isActive) amenities += Math.round((metadata.amenities ?? 0) * boost);
  }

  return { housing, amenities };
}
