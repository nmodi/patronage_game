import { useGameStore } from "~/stores/useGameStore";
import type { BuildingId } from "./buildings";

// Rectangular run of road cells, one entry per cell (demo seeds per-cell, the
// in-game drag tool widens stretches itself).
function road(x0: number, y0: number, x1: number, y1: number, id: BuildingId = "road") {
  const cells: Array<[number, number, BuildingId]> = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) cells.push([x, y, id]);
  }
  return cells;
}

// ponytail: dev-only visual test scene (load /?demo). Not reachable in normal play.
// A small Renaissance town: the Main Plaza at the center with the cathedral
// (west) and palazzo (east) fronting it, an artisan street north, market
// quarter south, residential quarter around the secondary plaza southwest,
// and dirt lanes out to the vineyards southeast.
// Facing: local front maps to grid [+x, −y, −x, +y] for quarter rotations 0–3
// (front is local +X for cathedral/cottage/bakery/suppliers, +Z for
// palazzo/workshop/tavern/chapel — +Z faces +y, +x, −y, −x for r=0–3).
const LAYOUT: Array<[number, number, BuildingId, number?]> = [
  // — Town center —
  [34, 34, "town_center_plaza"], // 12x12, cells 34-45
  ...road(32, 32, 33, 47), // ring road, west side
  ...road(46, 32, 47, 47), // east side
  ...road(34, 32, 45, 33), // north side
  ...road(34, 46, 45, 47), // south side

  // — Cathedral square, west, facing the plaza —
  [18, 35, "cathedral"], // 14x10, east facade on the ring road
  [28, 30, "bell_tower"], // campanile at the cathedral's NE corner
  [14, 32, "cypress"], [14, 36, "tree"], [15, 41, "tree"],

  // — Palazzo, east, facing the plaza —
  [48, 35, "palazzo", 3], // 8x10 rotated, loggia toward the ring road
  [48, 32, "cypress"], [51, 32, "cypress"], [54, 32, "cypress"], // flanking row
  [57, 34, "cypress"], [57, 38, "fountain"], [57, 42, "cypress"], // rear garden

  // — Artisan street, north, along the avenue —
  ...road(38, 22, 40, 31, "avenue"),
  [34, 26, "workshop", 1], // west side, door on the avenue
  [41, 26, "workshop", 3], // east side
  [34, 21, "pigment_trader"],
  [41, 21, "marble_supplier", 2],
  [38, 20, "obelisk"], // marks the head of the avenue

  // — Market quarter, south —
  [36, 48, "market"], // 8x8 against the ring road
  [31, 48, "bakery", 1],
  [44, 48, "tavern", 2],

  // — Residential quarter, southwest, around the secondary plaza —
  ...road(12, 46, 31, 47), // spur street west from the ring
  [12, 48, "plaza"], // secondary plaza (8x8) refreshes the network
  [7, 48, "townhouse"], [7, 53, "townhouse"], // facing the plaza
  [20, 48, "cottage", 1], [25, 48, "cottage", 1], // facing the spur street
  ...road(24, 48, 24, 56, "path"), // lane between the house columns
  [20, 53, "townhouse"], [25, 53, "townhouse", 2], // facing the lane
  [14, 56, "chapel", 2], // south of the plaza, door facing it
  [29, 52, "bush"], [22, 58, "bush"], [30, 60, "tree"],

  // — Farmland, southeast, on dirt lanes —
  ...road(48, 46, 55, 46, "dirt_path"), // lane east past the palazzo
  ...road(55, 47, 55, 58, "dirt_path"), // south to the fields
  [49, 53, "vineyard"],
  [47, 53, "fence", 1], [49, 58, "fence"],
  [57, 49, "vineyard", 1],
  [57, 56, "olive_grove"],
  [58, 63, "rocks"], [62, 48, "boulder"],

  // — Outskirts —
  [24, 16, "tree"], [44, 16, "tree"], [10, 28, "tree"], [60, 30, "tree"], [12, 62, "tree"],
];

export function seedDemoCity() {
  const state = useGameStore.getState();
  if (Object.keys(state.map.tiles).length > 0) return;
  const florins = state.florins;
  state.setFlorins(1_000_000);
  for (const [x, y, buildingId, rotation] of LAYOUT) {
    useGameStore.getState().placeTile({ x, y }, buildingId, rotation);
  }
  useGameStore.getState().setFlorins(florins);
  // Fill the town and run one tick so buildings render staffed even under &pause.
  useGameStore.getState().setPopulation(useGameStore.getState().getHousing());
  useGameStore.getState().tick();
  // Completed works so the gallery codex has content in demo mode.
  const founder = useGameStore.getState().artists[0];
  if (founder) {
    useGameStore.setState({
      artworks: [
        { id: "demo-art-1", name: "Madonna of the Lilies", requester: "The Church", artistId: founder.id, artistType: founder.type, completedTick: 14 },
        { id: "demo-art-2", name: "Portrait of Contessina de' Bardi", requester: "House Medici", artistId: founder.id, artistType: founder.type, completedTick: 43 },
      ],
    });
  }
}
