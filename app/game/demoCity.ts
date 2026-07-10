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
// (west) and palazzo (south) fronting adjacent sides — both fit one isometric
// screenshot — an artisan street north, market quarter east, residential
// quarter around the secondary plaza southwest, and dirt lanes out to the
// vineyards southeast. Around that core, Florence-style outer quarters: a
// walled north gate on the extended avenue, a northeast quarter with its own
// piazza, a street west past the cathedral with a cloister garden, an
// Oltrarno quarter south of the palazzo, and a farmland belt east and south.
// Facing: local front maps to grid [+x, −y, −x, +y] for quarter rotations 0–3
// (front is local +X for cathedral/cottage/bakery/suppliers, +Z for
// palazzo/workshop/tavern/chapel — +Z faces +y, +x, −y, −x for r=0–3).
export const LAYOUT: Array<[number, number, BuildingId, number?]> = [
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

  // — Palazzo, south, facing the plaza (adjacent to the cathedral's side) —
  [35, 48, "palazzo", 2], // 10x8, loggia toward the ring road

  // — Artisan street, north, along the avenue —
  ...road(38, 22, 40, 31, "avenue"),
  [34, 26, "workshop", 1], // west side, door on the avenue
  [41, 26, "sculpture_workshop", 3], // east side, beside the marble supplier
  [34, 21, "pigment_trader"],
  [41, 21, "marble_supplier", 2],
  [38, 20, "obelisk"], // marks the head of the avenue

  // — Market quarter, east (the palazzo's old grounds) —
  [48, 36, "market"], // 8x8 against the ring road
  [48, 32, "cypress"], [51, 32, "cypress"], [54, 32, "cypress"], // flanking row
  [57, 34, "cypress"], [57, 38, "fountain"], [57, 42, "cypress"], // rear garden
  [48, 48, "tavern", 2], // fronting the dirt lane
  [31, 48, "bakery", 1], // west of the palazzo, on the residential edge

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
  ...road(48, 46, 55, 46, "dirt_path"), // lane east past the market
  ...road(55, 47, 55, 58, "dirt_path"), // south to the fields
  [49, 53, "vineyard"],
  [47, 53, "fence", 1], [49, 58, "fence"],
  [57, 49, "vineyard", 1],
  [57, 56, "olive_grove"],
  [58, 63, "rocks"], [62, 48, "boulder"],

  // — North quarter (San Lorenzo): the avenue runs to a walled gate, with a
  //   cross street of housing blocks flanking it —
  ...road(38, 10, 40, 17, "avenue"), // avenue to the north gate
  ...road(40, 20, 40, 21, "avenue"), // slips past the obelisk to rejoin it
  ...road(30, 18, 53, 19), // cross street
  [30, 10, "stone_wall"], [34, 10, "stone_wall"], // old city wall, gate at the avenue
  [41, 10, "stone_wall"], [45, 10, "stone_wall"],
  [36, 7, "cypress"], [41, 7, "cypress"], // flanking the gate
  [26, 14, "townhouse", 3], [31, 14, "cottage", 3], // north side of the cross street
  [42, 14, "cottage", 3], [47, 14, "townhouse", 3],
  [29, 21, "townhouse", 1], [46, 21, "townhouse", 1], // south side, beside the suppliers

  // — Northeast quarter (Santa Croce): its own piazza and streets —
  ...road(52, 20, 53, 31), // down from the cross street
  ...road(54, 24, 68, 25), // east past the piazza
  [54, 16, "plaza"], // neighborhood piazza (8x8)
  [54, 11, "townhouse", 3], [59, 11, "cottage", 3], // backing the piazza
  [64, 16, "bakery", 3], [64, 20, "cottage", 3], [68, 20, "townhouse", 3],
  [55, 27, "townhouse", 1], [63, 27, "cottage", 1], // south side of the street
  [47, 27, "cottage"], [68, 27, "tavern", 2],
  [63, 32, "workshop"], [70, 32, "pigment_trader"], // artisan spillover

  // — West quarter: a street past the cathedral, cloister garden behind —
  ...road(16, 33, 31, 34), // west from the ring road, under the campanile
  [16, 28, "townhouse", 3], [21, 28, "townhouse", 3], // north side
  [5, 34, "colonnade"], [5, 42, "colonnade"], // cloister quad behind the cathedral
  [7, 38, "fountain"], [3, 36, "cypress"], [3, 39, "cypress"],
  [2, 48, "townhouse"], [2, 53, "townhouse"], // west edge of the residential quarter

  // — Oltrarno, south of the palazzo —
  ...road(30, 48, 30, 57, "path"), // lane down from the spur street
  ...road(31, 56, 46, 57), // street along the palazzo's back
  [36, 59, "cottage", 1], [41, 59, "cottage", 1], // fronting it
  ...road(24, 57, 24, 63, "path"), // residential lane continues south
  ...road(19, 64, 33, 64, "path"), // to a country cross lane
  [19, 66, "cottage", 1], [26, 66, "cottage", 1], [32, 60, "townhouse", 1],
  [34, 66, "olive_grove"], [24, 70, "cypress"],
  [18, 72, "stone_wall"], [24, 72, "stone_wall"], [30, 72, "stone_wall"], // south wall ruins
  [4, 60, "olive_grove"], [10, 68, "vineyard"], // groves southwest
  [44, 63, "bush"], [6, 70, "tree"],

  // — East farmland belt, along the extended dirt lane —
  ...road(56, 46, 70, 46, "dirt_path"),
  [60, 44, "cypress"], [64, 44, "cypress"], [68, 44, "cypress"], // allee above the lane
  [65, 40, "cottage", 3], [70, 41, "cottage", 3], // farmhouses
  [63, 50, "vineyard"], [71, 48, "vineyard", 1], [70, 55, "vineyard"],
  [64, 56, "olive_grove"],
  [64, 48, "fence"], [69, 50, "fence", 1],
  [71, 61, "vineyard"],
  [70, 59, "rocks"], [72, 36, "tree"],

  // — Outskirts —
  [24, 16, "tree"], [48, 7, "tree"], [10, 28, "tree"], [60, 30, "tree"], [12, 62, "tree"],
  [20, 8, "tree"], [52, 8, "tree"], [74, 24, "tree"],
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
