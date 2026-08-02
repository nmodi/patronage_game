import { BUILDING_METADATA_BY_ID } from "../buildings.ts";
import { BASE_POPULATION_CAP } from "../constants.ts";
import { computePlazaConnectivity, connectionBonusOf } from "./connectivity.ts";
import { displayBoost } from "../art/display.ts";
import type { TileMap } from "../grid.ts";
import { trafficFactor } from "./traffic.ts";

export interface CityMetrics {
  housing: number;
  amenities: number;
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

  for (const [key, tile] of Object.entries(tiles)) {
    if (!tile.isOrigin) continue;
    const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
    if (!metadata) continue;
    const boost =
      (1 +
        connectionBonusOf(metadata) *
          (connected.get(key) ?? 0) *
          trafficFactor(metadata, key, tiles, population)) *
      displayBoost(displayCounts?.get(key) ?? 0);
    housing += Math.round((metadata.housing ?? 0) * boost);
    if (tile.isActive) amenities += Math.round((metadata.amenities ?? 0) * boost);
  }

  return { housing, amenities };
}
