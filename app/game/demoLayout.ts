import type { BuildingId } from "./buildings.ts";

// The demo run's map seed. "toscana" rolls an *inland* archetype whose river
// runs down the east of the grid (gx ~80-93, full height) — clear of the hand-
// placed city on the west bank, so LAYOUT never collides with water. The Stone
// Bridge below crosses it to an east-bank villa estate. Kept in this pure,
// store-free module so demoLayout.check.ts can replay the whole layout against
// the real water layer under Node. (`?demo&map=<seed>` still overrides it.)
export const DEMO_MAP_SEED = "toscana";

// Rectangular run of road cells, one entry per cell (demo seeds per-cell, the
// in-game drag tool widens stretches itself).
export function road(x0: number, y0: number, x1: number, y1: number, id: BuildingId = "road") {
  const cells: Array<[number, number, BuildingId]> = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) cells.push([x, y, id]);
  }
  return cells;
}

// Diagonal run: one cell per ±(1,±1) step, wider roads offset +1 along x per
// row; the 4th tuple element is Tile.rotation (1 = NE, 3 = NW — roadStretch.ts).
export function diagRoad(
  x0: number,
  y0: number,
  steps: number,
  sx: 1 | -1,
  sy: 1 | -1,
  id: BuildingId = "road",
  width = 1
) {
  const cells: Array<[number, number, BuildingId, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    for (let w = 0; w < width; w += 1) {
      cells.push([x0 + i * sx + w, y0 + i * sy, id, sx === sy ? 1 : 3]);
    }
  }
  return cells;
}

// ponytail: dev-only visual test scene (load /?demo). Not reachable in normal play.
// A Renaissance town on the west bank of a river (map seed "toscana"): the Main
// Plaza at the center with the cathedral (west) and palazzo (south) fronting
// adjacent sides — both fit one isometric screenshot — an artisan street north,
// market quarter east, a residential quarter of blended row-house terraces
// southwest, and Florence-style outer quarters (a walled north gate, NE and
// west quarters, an Oltrarno south of the palazzo). The enlarged 120² map adds
// a proper countryside: a Stone Bridge east over the river to a villa estate,
// and a farmland belt pushed well south of the city.
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
  [18, 34, "cathedral"], // 14x12, rows flush with the plaza, east facade on the ring road
  [28, 30, "bell_tower"], // campanile at the cathedral's NE corner
  // (the cathedral-square trees are now the canons' houses filling in behind it — see the west quarter)

  // — Palazzo, south, facing the plaza (adjacent to the cathedral's side) —
  [35, 48, "palazzo", 2], // 10x8, loggia toward the ring road

  // — Artisan street, north, along the avenue —
  ...road(38, 22, 40, 31, "avenue"),
  [34, 26, "workshop", 1], // west side, door on the avenue
  [41, 26, "sculpture_workshop", 3], // east side, beside the marble supplier
  [34, 21, "pigment_trader"],
  [41, 21, "marble_supplier", 2],
  [38, 20, "obelisk"], // marks the head of the avenue

  // — Market quarter, east —
  [48, 34, "market"], [48, 38, "market"], [48, 42, "market"], // 7x4, three stacked along the plaza's east edge
  [48, 32, "cypress"], [51, 32, "cypress"], [54, 32, "cypress"], // flanking row
  [57, 34, "cypress"], [57, 38, "fountain"], [57, 42, "cypress"], // rear garden
  [59, 34, "bronze_foundry"], // casts bronze for the sculptors, by the market garden's statue
  [46, 48, "tavern", 2], // facing the main plaza (front toward −y, like the palazzo)
  [31, 48, "bakery", 1], // west of the palazzo, on the residential edge
  [60, 38, "sculpture_display"], // statue pedestal in the market's rear garden

  // — Residential quarter, SW: a lane between two blended row-house terraces —
  ...road(12, 46, 31, 47), // spur street west from the ring
  [12, 48, "plaza"], // secondary plaza (8x8) refreshes the network
  ...road(26, 48, 26, 64, "path"), // the residential lane (spills into the Oltrarno piazzetta below)
  // West terrace — doors face east onto the lane, so the houses blend along
  // their north/south walls into one continuous row (cottages ↔ townhouses).
  [22, 48, "cottage", 0], [22, 52, "townhouse", 0], [22, 56, "cottage", 0], [22, 60, "townhouse", 0],
  // East terrace — doors face west onto the lane; blends the same way.
  [27, 48, "townhouse", 2], [27, 52, "cottage", 2], [27, 56, "townhouse", 2], [27, 60, "cottage", 2],
  [8, 52, "cottage"], // deliberately isolated (gap from townhouse 2,48) — keeps the inset look (blend contrast)
  [14, 56, "chapel", 2], // south of the plaza, door facing it
  [8, 58, "tree"], [10, 62, "cypress"], [31, 62, "bush"],

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
  [47, 27, "cottage"], [68, 26, "tavern", 2],
  [63, 33, "workshop"], [70, 33, "pigment_trader"], // artisan spillover

  // — West quarter: a street past the cathedral, cloister garden behind —
  ...road(16, 33, 31, 33), // west from the ring road, under the campanile
  [16, 28, "townhouse", 3], [21, 28, "townhouse", 3], // north side
  [5, 34, "colonnade"], [5, 42, "colonnade"], // cloister quad behind the cathedral
  [7, 38, "fountain"], [3, 36, "cypress"], [3, 39, "cypress"],
  [2, 48, "townhouse"], [2, 53, "townhouse"], // west edge of the residential quarter
  // Canons' houses filling in behind (west of) the cathedral, around the cloister.
  ...road(10, 28, 11, 44, "path"),
  [12, 28, "townhouse", 2], [12, 32, "cottage", 2], [12, 36, "townhouse", 2], [12, 40, "cottage", 2], // east of the lane
  [2, 27, "cottage", 1], [6, 27, "townhouse", 1], // north of the cloister
  [2, 44, "townhouse", 3], [6, 44, "cottage", 3], // south of the cloister
  [8, 34, "bush"], [14, 44, "tree"],

  // — Oltrarno, south of the palazzo (the residential lane spills into it) —
  [24, 65, "small_plaza"], // piazzetta closing the residential lane (gx24-28, gy65-69)
  ...road(29, 66, 46, 67, "path"), // street along the palazzo's back, east from the piazzetta
  [36, 60, "cottage", 1], [41, 60, "cottage", 1], // fronting it (door north)
  ...road(26, 70, 27, 79, "path"), // paved lane continues south to the new quarter
  [19, 70, "cottage", 3], [32, 62, "townhouse", 1],
  [18, 64, "olive_grove"], [45, 64, "bush"], [6, 66, "tree"],

  // ================= COUNTRYSIDE (the enlarged 120² map) =================

  // — Country lane east from the ring road to the river, and the Stone Bridge.
  //   Map seed "toscana" runs the river down gx ~83-90 here; the bridge (cells
  //   85-90) is the one structure allowed onto water. —
  ...road(48, 46, 84, 47, "road"), // paved road out to the riverbank + bridge
  ...road(85, 46, 90, 47, "bridge"), // stone bridge across the river
  [60, 44, "cypress"], // a street tree by the market garden

  // — Between the markets and the river: a market extension + a paved street
  //   with a riverside row of houses (kept west of the river at gx ~82+) —
  [64, 37, "market"], [74, 36, "townhouse", 3],
  ...road(63, 41, 79, 41, "path"),
  [63, 42, "cottage", 1], [67, 42, "townhouse", 1], [71, 42, "cottage", 1], [75, 42, "townhouse", 1],
  [80, 44, "cypress"],

  // — Region A: a dense new quarter filling the field south of the market,
  //   between the paved road (north), the SW quarter (west) and the cross-road
  //   (south). Paved spine avenue + cross streets, terraced housing, a piazzetta,
  //   a bakery + workshop. —
  ...road(62, 48, 63, 79, "road"), // spine avenue, links the river road to the cross-road
  ...road(50, 57, 61, 57, "path"), ...road(64, 57, 78, 57, "path"), // cross street, gy57
  ...road(50, 68, 61, 68, "path"), ...road(64, 68, 78, 68, "path"), // cross street, gy68
  [52, 72, "small_plaza"], // neighborhood piazzetta (gx52-56, gy72-76)
  // West terraces — doors east onto the avenue, blend vertically
  [58, 58, "townhouse", 0], [58, 62, "cottage", 0],
  [58, 70, "cottage", 0], [58, 74, "townhouse", 0],
  // A row facing cross street gy57 (doors north), blends horizontally
  [48, 58, "cottage", 1], [52, 58, "townhouse", 1],
  // East terraces — doors west onto the avenue
  [64, 58, "cottage", 2], [64, 62, "townhouse", 2],
  [64, 70, "townhouse", 2], [64, 74, "cottage", 2],
  // East blocks: a bakery + houses fronting the river road, a workshop, more houses
  [64, 49, "bakery", 1], [69, 49, "cottage", 1], [73, 49, "townhouse", 1],
  [70, 60, "workshop", 0],
  [70, 71, "townhouse", 1], [74, 71, "cottage", 1],
  [55, 51, "fountain"], [72, 64, "tree"], [78, 64, "bush"], [50, 64, "tree"],

  // — East-bank villa estate (across the river) —
  ...road(91, 46, 106, 47, "dirt_path"), // estate lane from the bridge
  ...road(100, 40, 101, 45, "dirt_path"), // cross lane, north of the estate lane
  ...road(100, 48, 101, 55, "dirt_path"), // cross lane, south of it
  [102, 32, "small_plaza"], // the villa's forecourt
  [96, 34, "townhouse", 2], // the villa farmhouse
  [110, 34, "sculpture_display"], // a statue in the garden
  [94, 50, "vineyard"], [104, 50, "vineyard", 1],
  [108, 44, "olive_grove"], [112, 55, "olive_grove"],
  [104, 42, "fountain"],
  [92, 38, "cypress"], [113, 40, "cypress"], [113, 50, "cypress"],
  [95, 56, "fence"], [96, 56, "fence"], [97, 56, "fence"], [98, 56, "fence"],
  [106, 58, "rocks"], [116, 44, "boulder"], [90, 34, "bush"],

  // — South rural belt: the farmland pushed well south of the city (roads first,
  //   so the field decorations may overlap the lane edges) —
  ...road(16, 80, 74, 81, "road"), // paved cross-road along the quarter's south edge
  ...road(60, 82, 61, 96, "dirt_path"), // spur into the deep fields
  // A little blended farm row facing the cross-road (doors north) — merges into a terrace.
  [38, 82, "cottage", 1], [42, 82, "cottage", 1], [46, 82, "cottage", 1],
  [18, 84, "vineyard"], [26, 84, "vineyard", 1], [52, 84, "vineyard"],
  [8, 88, "olive_grove"], [66, 84, "olive_grove"],
  [30, 92, "vineyard", 1], [50, 92, "olive_grove"], [40, 96, "vineyard"],
  [16, 94, "cottage", 3], // a lone farmhouse
  [12, 86, "cypress"], [24, 90, "cypress"], [54, 90, "cypress"], [68, 94, "cypress"],
  [33, 78, "fence"], [34, 78, "fence"], [35, 78, "fence"], [36, 78, "fence"], // field edge above the road
  [22, 98, "stone_wall"], [22, 99, "stone_wall"], [22, 100, "stone_wall"], [22, 101, "stone_wall"],
  [8, 98, "boulder"], [70, 98, "rocks"], [46, 98, "bush"], [58, 100, "tree"],
  [48, 102, "olive_grove"], [30, 102, "vineyard"],

  // — Region B: densify the NE quarters + a suburb north of the San Lorenzo gate —
  ...road(24, 5, 51, 5, "road"), // the suburb's street, north of the gate
  ...road(38, 6, 40, 9, "avenue"), // the gate arch continues north to it
  [24, 6, "cottage", 1], [28, 6, "townhouse", 1], [32, 6, "cottage", 1], // west of the gate
  [44, 6, "townhouse", 1], [48, 6, "cottage", 1], // east of the gate
  [22, 9, "cypress"], [53, 8, "cypress"], [20, 6, "tree"],
  // Infill east of the Santa Croce piazza (kept west of the river at gx77+).
  ...road(69, 12, 70, 19, "path"),
  [64, 11, "cottage", 1], // backs the piazza, west of the new lane
  [72, 12, "townhouse", 2], [72, 16, "cottage", 2], [72, 20, "townhouse", 2], // east street row (doors west)
  [59, 30, "cottage", 3], [74, 24, "bush"],

  // — Outskirts: scatter to the far corners of the enlarged map (clear of the
  //   river band gx ~84-92) —
  [24, 16, "tree"], [10, 20, "tree"], [6, 74, "tree"],
  [20, 8, "tree"], [52, 8, "tree"], [64, 8, "cypress"],
  [78, 14, "tree"], [98, 18, "tree"], [108, 24, "cypress"], [112, 12, "tree"],
  [100, 66, "tree"], [110, 72, "cypress"], [78, 92, "tree"], [104, 92, "tree"],
  [12, 108, "tree"], [40, 110, "cypress"], [74, 108, "tree"], [100, 106, "tree"],

  // — Diagonal streets (Florence-style cuts across the grid; both ribbon
  //   orientations exercised for the renderer) —
  // NE width-2 road: cuts the SW field from the Oltrarno back street (gy66-67)
  // down to the south cross-road (gy80) — the shortcut a real city would wear.
  ...diagRoad(34, 68, 11, 1, 1, "road", 2),
  // NW path: a lane threading Region A from cross street gy68 up between the
  // terraces and the workshop block.
  ...diagRoad(49, 68, 6, 1, -1, "path"),
];
