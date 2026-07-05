import { useGameStore } from "~/stores/useGameStore";
import type { BuildingId } from "./buildings";

// ponytail: dev-only visual test scene (load /?demo). Not reachable in normal play.
const LAYOUT: Array<[number, number, BuildingId]> = [
  [9, 9, "plaza"],
  [12, 9, "market"],
  [12, 7, "pigment_trader"],
  [12, 12, "workshop"],
  [6, 7, "cottage"],
  [7, 7, "cottage"],
  [6, 8, "cottage"],
  [7, 8, "cottage"],
  [8, 7, "cottage"],
  [6, 10, "townhouse"],
  [7, 10, "townhouse"],
  [8, 10, "townhouse"],
  // road ring around the plaza with spurs to the districts
  [8, 8, "road"], [8, 9, "road"], [8, 10, "road"], [8, 11, "road"],
  [9, 8, "road"], [10, 8, "road"], [11, 8, "road"],
  [9, 11, "road"], [10, 11, "road"], [11, 11, "road"],
  [11, 9, "road"], [11, 10, "road"],
  [11, 7, "road"], [11, 12, "road"],
  [5, 7, "tree"], [5, 10, "tree"], [9, 6, "tree"], [13, 11, "tree"],
  [14, 8, "tree"], [8, 13, "tree"], [10, 13, "tree"], [5, 12, "tree"],
];

export function seedDemoCity() {
  const state = useGameStore.getState();
  if (Object.keys(state.map.tiles).length > 0) return;
  const florins = state.florins;
  state.setFlorins(1_000_000);
  for (const [x, y, buildingId] of LAYOUT) {
    useGameStore.getState().placeTile({ x, y }, buildingId);
  }
  useGameStore.getState().setFlorins(florins);
}
