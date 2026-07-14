import type { BuildingType, BuildingMetadata } from "./types";

export const BUILDING_TYPES = [
  {
    type: "city",
    id: "town_center_plaza",
    name: "Town Center Plaza",
    baseCost: 600,
    size: { width: 5.9, height: 0.05, depth: 5.9 },
    color: "#d9b877",
    footprint: { width: 12, depth: 12 },
    paved: true,
    generates: {
      inspiration: 8,
    },
    isHub: true,
    workersRequired: 0,
    maxWorkers: 0,
    // Plinths at the pad corners, clear of the central fountain keep-out.
    displaySlots: [
      { kind: "plinth", cell: { x: 2, y: 2 } },
      { kind: "plinth", cell: { x: 9, y: 2 } },
      { kind: "plinth", cell: { x: 2, y: 9 } },
      { kind: "plinth", cell: { x: 9, y: 9 } },
    ],
  },
  {
    type: "city",
    id: "plaza",
    name: "Plaza",
    baseCost: 250,
    size: { width: 3.9, height: 0.05, depth: 3.9 },
    color: "#d9b877",
    footprint: { width: 8, depth: 8 },
    paved: true,
    generates: {
      inspiration: 4,
    },
    isHub: true,
    workersRequired: 0,
    maxWorkers: 0,
    // Two plinths flanking the fountain (point-symmetric across the center).
    displaySlots: [
      { kind: "plinth", cell: { x: 1, y: 3 } },
      { kind: "plinth", cell: { x: 6, y: 4 } },
    ],
  },
  {
    type: "city",
    id: "small_plaza",
    name: "Small Plaza",
    baseCost: 100,
    // Width matches the chapel's short edge (5 cells).
    size: { width: 2.4, height: 0.05, depth: 2.4 },
    color: "#d9b877",
    footprint: { width: 5, depth: 5 },
    paved: true,
    generates: {
      inspiration: 2,
    },
    isHub: true,
    workersRequired: 0,
    maxWorkers: 0,
    // One central plinth (the piazzetta has no fountain).
    displaySlots: [{ kind: "plinth", cell: { x: 2, y: 2 } }],
  },
  // ponytail: no effects yet — palazzo/cathedral will unlock noble/religious
  // commissions in a later phase; for now they're landmark set pieces.
  {
    type: "city",
    id: "palazzo",
    name: "Palazzo",
    baseCost: 900,
    size: { width: 4.2, height: 3.1, depth: 3.4 },
    color: "#c9b183",
    footprint: { width: 10, depth: 8 },
    paved: true,
    workersRequired: 0,
    maxWorkers: 0,
    displaySlots: [
      { kind: "painting" },
      { kind: "painting" },
      { kind: "painting" },
      { kind: "statue" },
      { kind: "statue" },
    ],
  },
  {
    type: "city",
    id: "cathedral",
    name: "Cathedral",
    baseCost: 1500,
    // Short edge matches the Town Center Plaza's 12 cells so the facade fronts
    // it flush, no grass strips.
    size: { width: 6.3, height: 5.4, depth: 5.4 },
    color: "#d8d2c4",
    footprint: { width: 14, depth: 12 },
    paved: true,
    workersRequired: 0,
    maxWorkers: 0,
    displaySlots: [
      { kind: "painting" },
      { kind: "painting" },
      { kind: "painting" },
      { kind: "painting" },
      { kind: "statue" },
      { kind: "statue" },
    ],
  },
  {
    type: "city",
    id: "chapel",
    name: "Chapel",
    baseCost: 400,
    size: { width: 2.2, height: 2.3, depth: 3.4 },
    color: "#d8d2c4",
    footprint: { width: 5, depth: 8 },
    paved: true,
    workersRequired: 0,
    maxWorkers: 0,
    displaySlots: [{ kind: "painting" }, { kind: "painting" }, { kind: "statue" }],
  },
  {
    type: "artist",
    id: "workshop",
    name: "Painter's Workshop",
    baseCost: 100,
    size: { width: 2.6, height: 1.6, depth: 1.7 },
    color: "#c9a876",
    footprint: { width: 6, depth: 4 },
    paved: true,
    workersRequired: 2,
    maxWorkers: 4,
    artistCapacity: 2,
    artistType: "painter",
    displaySlots: [{ kind: "painting" }],
  },
  {
    type: "artist",
    id: "sculpture_workshop",
    name: "Sculptor's Workshop",
    baseCost: 100,
    size: { width: 2.6, height: 1.6, depth: 1.7 },
    color: "#c8c2b6",
    footprint: { width: 6, depth: 4 },
    paved: true,
    workersRequired: 2,
    maxWorkers: 4,
    artistCapacity: 2,
    artistType: "sculptor",
    // Display plinth in the stone yard, front-right of the +X bay (cell (4,3)
    // ≈ model-local (0.42, 0.68), the old decorative plinth's spot) — clear of
    // the -X-bay door.
    displaySlots: [{ kind: "plinth", cell: { x: 4, y: 3 } }],
  },
  {
    type: "residential",
    id: "cottage",
    name: "Cottage",
    baseCost: 150,
    size: { width: 1.7, height: 1.4, depth: 1.7 },
    color: "#c1694f",
    footprint: { width: 4, depth: 4 },
    paved: true,
    // generates: {
    //   income: 5,
    // },
    housing: 4,
    workersRequired: 0,
    maxWorkers: 0,
  },
  {
    type: "residential",
    id: "townhouse",
    name: "Townhouse",
    baseCost: 400,
    size: { width: 1.7, height: 2.2, depth: 1.7 },
    color: "#a8503a",
    footprint: { width: 4, depth: 4 },
    paved: true,
    // generates: {
    //   income: 5,
    // },
    housing: 8,
    workersRequired: 0,
    maxWorkers: 0,
  },
  {
    type: "materials",
    id: "pigment_trader",
    name: "Pigment Trader",
    baseCost: 200,
    size: { width: 1.6, height: 2.4, depth: 1.6 },
    color: "#b98d54",
    footprint: { width: 4, depth: 4 },
    paved: true,
    workersRequired: 2,
    maxWorkers: 4,
    supplies: { material: "pigment", capacity: 3 },
  },
  {
    type: "materials",
    id: "marble_supplier",
    name: "Marble Supplier",
    baseCost: 250,
    size: { width: 1.8, height: 1.2, depth: 1.8 },
    color: "#c8c2b6",
    footprint: { width: 4, depth: 4 },
    paved: true,
    workersRequired: 2,
    maxWorkers: 4,
    supplies: { material: "marble", capacity: 2 },
  },
  {
    type: "materials",
    id: "bronze_foundry",
    name: "Bronze Foundry",
    baseCost: 300,
    size: { width: 1.8, height: 1.4, depth: 1.8 },
    color: "#8c6a3f",
    footprint: { width: 4, depth: 4 },
    paved: true,
    workersRequired: 2,
    maxWorkers: 4,
    supplies: { material: "bronze", capacity: 2 },
  },
  {
    type: "materials",
    id: "market",
    name: "Market",
    baseCost: 200,
    size: { width: 3.3, height: 0.9, depth: 1.8 },
    color: "#a9432f",
    footprint: { width: 7, depth: 4 },
    paved: true,
    generates: {
      income: 10,
    },
    workersRequired: 3,
    maxWorkers: 6,
  },
  {
    type: "service",
    id: "bakery",
    name: "Bakery",
    baseCost: 150,
    size: { width: 1.6, height: 1.5, depth: 1.6 },
    color: "#d9a066",
    footprint: { width: 4, depth: 4 },
    paved: true,
    amenities: 20,
    workersRequired: 1,
    maxWorkers: 2,
  },
  {
    type: "service",
    id: "tavern",
    name: "Tavern",
    baseCost: 200,
    // 1.5× the workshop footprint so the two stop reading as the same building,
    // plus one extra tile of depth for the terrace out front.
    size: { width: 3.9, height: 1.6, depth: 3.0 },
    color: "#8c5a3c",
    footprint: { width: 9, depth: 7 },
    paved: true,
    amenities: 25,
    workersRequired: 1,
    maxWorkers: 2,
    displaySlots: [{ kind: "painting" }],
  },
  // Road variants share type "road" (sim/render key off the type); they differ
  // only in how many cells the drag tool stamps perpendicular to the stretch.
  // Cost is charged per cell, so wider roads cost more per length.
  {
    type: "road",
    id: "dirt_path",
    name: "Dirt Path",
    baseCost: 10,
    size: { width: 0.5, height: 0.02, depth: 0.5 },
    color: "#8a6a4d",
    footprint: { width: 1, depth: 1 },
    roadWidth: 1,
  },
  {
    type: "road",
    id: "path",
    name: "Path",
    baseCost: 25,
    size: { width: 0.5, height: 0.02, depth: 0.5 },
    color: "#9c8570",
    footprint: { width: 1, depth: 1 },
    roadWidth: 1,
  },
  {
    type: "road",
    id: "road",
    name: "Road",
    baseCost: 25,
    size: { width: 0.5, height: 0.02, depth: 0.5 },
    color: "#9c8570",
    footprint: { width: 1, depth: 1 },
    roadWidth: 2,
  },
  {
    type: "road",
    id: "avenue",
    name: "Avenue",
    baseCost: 25,
    size: { width: 0.5, height: 0.02, depth: 0.5 },
    color: "#9c8570",
    footprint: { width: 1, depth: 1 },
    roadWidth: 3,
  },
  // The one structure allowed onto water cells (G5). Sharing type "road"
  // buys drag placement, plaza connectivity, and citizen walkability free;
  // land placement is also fine — it reads as a stone causeway.
  {
    type: "road",
    id: "bridge",
    name: "Stone Bridge",
    baseCost: 80,
    size: { width: 0.5, height: 0.05, depth: 0.5 },
    color: "#cbbfa3",
    footprint: { width: 1, depth: 1 },
    roadWidth: 2,
  },
  {
    type: "decoration",
    id: "tree",
    name: "Tree",
    baseCost: 25,
    size: { width: 0.5, height: 0.7, depth: 0.5 },
    color: "#3f6b3a",
    footprint: { width: 2, depth: 2 },
  },
  {
    type: "decoration",
    id: "cypress",
    name: "Cypress",
    baseCost: 25,
    size: { width: 0.3, height: 1.4, depth: 0.3 },
    color: "#3f5c35",
    footprint: { width: 2, depth: 2 },
  },
  {
    type: "decoration",
    id: "vineyard",
    name: "Vineyard",
    baseCost: 120,
    size: { width: 2.8, height: 0.35, depth: 1.8 },
    color: "#55743c",
    footprint: { width: 6, depth: 4 },
  },
  {
    type: "decoration",
    id: "fountain",
    name: "Fountain",
    baseCost: 150,
    size: { width: 1.3, height: 0.5, depth: 1.3 },
    color: "#c8c2b4",
    footprint: { width: 3, depth: 3 },
    paved: true,
  },
  {
    type: "decoration",
    id: "colonnade",
    name: "Colonnade",
    baseCost: 30, // per cell — drag a run like a road
    size: { width: 2.8, height: 1.2, depth: 0.4 },
    color: "#d8d2c4",
    footprint: { width: 1, depth: 1 },
    paved: true,
    linear: true,
  },
  {
    type: "decoration",
    id: "obelisk",
    name: "Obelisk",
    baseCost: 150,
    size: { width: 0.35, height: 1.4, depth: 0.35 },
    color: "#d8d2c4",
    footprint: { width: 2, depth: 2 },
    paved: true,
  },
  {
    type: "decoration",
    id: "olive_grove",
    name: "Olive Grove",
    baseCost: 120,
    size: { width: 2.8, height: 0.8, depth: 2.8 },
    color: "#75854d",
    footprint: { width: 6, depth: 6 },
  },
  {
    type: "decoration",
    id: "bush",
    name: "Bush",
    baseCost: 10,
    size: { width: 0.4, height: 0.25, depth: 0.4 },
    color: "#6b7d46",
    footprint: { width: 1, depth: 1 },
  },
  {
    type: "decoration",
    id: "rocks",
    name: "Rocks",
    baseCost: 10,
    size: { width: 0.4, height: 0.2, depth: 0.4 },
    color: "#9d9384",
    footprint: { width: 1, depth: 1 },
  },
  {
    type: "decoration",
    id: "boulder",
    name: "Boulder",
    baseCost: 25,
    size: { width: 0.9, height: 0.6, depth: 0.9 },
    color: "#877e70",
    footprint: { width: 2, depth: 2 },
  },
  {
    type: "decoration",
    id: "fence",
    name: "Fence",
    baseCost: 8, // per cell — drag a run like a road
    size: { width: 1.9, height: 0.35, depth: 0.15 },
    color: "#9a7b57",
    footprint: { width: 1, depth: 1 },
    linear: true,
  },
  {
    type: "decoration",
    id: "stone_wall",
    name: "Stone Wall",
    baseCost: 10, // per cell — drag a run like a road
    size: { width: 1.9, height: 0.35, depth: 0.15 },
    color: "#d8d2c4",
    footprint: { width: 1, depth: 1 },
    linear: true,
  },
  {
    type: "decoration",
    id: "bell_tower",
    name: "Bell Tower",
    baseCost: 300,
    size: { width: 1.2, height: 4.5, depth: 1.2 },
    color: "#d8d2c4",
    paved: true,
    footprint: { width: 3, depth: 3 },
  },
  {
    // A statue pedestal placeable anywhere; 3×3 so the plinth centers on a cell.
    type: "decoration",
    id: "sculpture_display",
    name: "Sculpture Display",
    baseCost: 40,
    size: { width: 0.5, height: 0.35, depth: 0.5 },
    color: "#d8d2c4",
    paved: true,
    footprint: { width: 3, depth: 3 },
    displaySlots: [{ kind: "plinth", cell: { x: 1, y: 1 } }],
  },
] as const satisfies ReadonlyArray<BuildingMetadata>;

export type BuildingId = (typeof BUILDING_TYPES)[number]["id"];

// Building rotation encoding (Tile.rotation): 0-3 = cardinal quarter turns
// (pre-diagonal saves unchanged), 4-7 = quarter (r-4) plus a 45° offset.
// Paved road tiles keep their separate undefined|1|3 ribbon semantics.

/** Cardinal quarter component of a building rotation (0-3). */
export function quarterOf(rotation?: number) {
  return (((rotation ?? 0) % 4) + 4) % 4;
}

/** Whether a building rotation carries the extra 45° offset (values 4-7). */
export function isDiagonalRotation(rotation?: number): boolean {
  return rotation != null && rotation >= 4;
}

/** World yaw: quarter turns plus 45° for diagonal rotations. Local (lx,lz)
 * maps to grid (lx·cosθ + lz·sinθ, −lx·sinθ + lz·cosθ) — local +X faces grid
 * +x, −y, −x, +y at quarters 0-3 (the modelManifest ring convention). */
export function yawOfRotation(rotation?: number) {
  return (
    (Math.PI / 2) * quarterOf(rotation) + (isDiagonalRotation(rotation) ? Math.PI / 4 : 0)
  );
}

/** Footprint in grid space (quarter-frame bounding dims — for diagonal
 * rotations these are the dims of the rect *before* the 45° turn; the claimed
 * cells come from footprintMask). Odd quarter turns swap width/depth. */
export function rotatedFootprint(metadata: BuildingMetadata, rotation?: number) {
  const footprint = metadata.footprint ?? { width: 1, depth: 1 };
  return (rotation ?? 0) % 2 === 1
    ? { width: footprint.depth, depth: footprint.width }
    : footprint;
}

/** A building's claimed cells and center, in grid units relative to the
 * anchor cell (the Tile.origin). Cardinal rotations claim the axis-aligned
 * rect (anchor = min corner, offsets all ≥ 0). Diagonal rotations claim the
 * cells whose centers fall inside the 45°-rotated rect; the anchor is the
 * first claimed cell in row-major order (min y, then min x), so x offsets may
 * be negative — never y. (0,0) is always claimed and always first. */
export interface FootprintMask {
  cells: ReadonlyArray<{ x: number; y: number }>;
  /** Building center offset from the anchor cell center, in cells (grid x/y). */
  center: { x: number; y: number };
}

const MASK_EPSILON = 1e-6;
const maskCache = new Map<string, FootprintMask>();

export function footprintMask(metadata: BuildingMetadata, rotation?: number): FootprintMask {
  return footprintMaskFor(metadata.footprint ?? { width: 1, depth: 1 }, rotation);
}

/** footprintMask from bare dims — for callers holding only a footprint
 * (display slot math). Cached per dims × rotation. */
export function footprintMaskFor(
  footprint: { width: number; depth: number },
  rotation?: number
): FootprintMask {
  const diagonal = isDiagonalRotation(rotation);
  const quarter = quarterOf(rotation);
  const key = `${footprint.width}x${footprint.depth}:${quarter}${diagonal ? "d" : ""}`;
  const cached = maskCache.get(key);
  if (cached) return cached;

  let mask: FootprintMask;
  if (diagonal) {
    mask = rasterizeDiagonalMask(footprint, rotation!);
  } else {
    const swap = quarter % 2 === 1;
    const width = swap ? footprint.depth : footprint.width;
    const depth = swap ? footprint.width : footprint.depth;
    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < depth; dy += 1) {
      for (let dx = 0; dx < width; dx += 1) cells.push({ x: dx, y: dy });
    }
    mask = { cells, center: { x: (width - 1) / 2, y: (depth - 1) / 2 } };
  }
  maskCache.set(key, mask);
  return mask;
}

/** Cells whose centers lie inside the yaw-rotated W×D rect (ε-shrunk so
 * boundary-grazing centers never claim), scanned over the rect's bounding
 * window and re-anchored to the first claimed cell. */
function rasterizeDiagonalMask(
  { width, depth }: { width: number; depth: number },
  rotation: number
): FootprintMask {
  const theta = yawOfRotation(rotation);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const size = Math.ceil((width + depth) / Math.SQRT2 - MASK_EPSILON);
  const cells: { x: number; y: number }[] = [];
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const dx = i + 0.5 - size / 2;
      const dy = j + 0.5 - size / 2;
      // Inverse of the yaw map: grid offset → the rect's local frame.
      const lx = dx * cos - dy * sin;
      const lz = dx * sin + dy * cos;
      if (
        Math.abs(lx) < width / 2 - MASK_EPSILON &&
        Math.abs(lz) < depth / 2 - MASK_EPSILON
      ) {
        cells.push({ x: i, y: j });
      }
    }
  }
  if (cells.length === 0) {
    // 1×1 footprints have no interior cell centers at 45° — the building
    // claims its own cell, model rotated within it.
    return { cells: [{ x: 0, y: 0 }], center: { x: 0, y: 0 } };
  }
  const anchor = cells[0]!;
  return {
    cells: cells.map((c) => ({ x: c.x - anchor.x, y: c.y - anchor.y })),
    center: { x: size / 2 - anchor.x - 0.5, y: size / 2 - anchor.y - 0.5 },
  };
}

export const BUILDING_METADATA_BY_ID = BUILDING_TYPES.reduce(
  (acc, metadata) => {
    acc[metadata.id] = metadata;
    return acc;
  },
  {} as Record<BuildingId, BuildingMetadata>
);

export const BUILDING_METADATA_BY_TYPE = BUILDING_TYPES.reduce(
  (acc, metadata) => {
    if (!acc[metadata.type]) {
      acc[metadata.type] = [];
    }
    acc[metadata.type]!.push(metadata);
    return acc;
  },
  {} as Partial<Record<BuildingType, BuildingMetadata[]>>
);
