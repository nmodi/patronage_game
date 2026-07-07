import type { BuildingType, BuildingMetadata } from "./types";

export const BUILDING_TYPES = [
  {
    type: "city",
    id: "town_center_plaza",
    name: "Town Center Plaza",
    baseCost: 600,
    size: { width: 5.9, height: 0.05, depth: 5.9 },
    color: "#d9b877",
    footprint: { width: 6, depth: 6 },
    generates: {
      inspiration: 8,
    },
    isHub: true,
    workersRequired: 0,
    maxWorkers: 0,
  },
  {
    type: "city",
    id: "plaza",
    name: "Plaza",
    baseCost: 250,
    size: { width: 3.9, height: 0.05, depth: 3.9 },
    color: "#d9b877",
    footprint: { width: 4, depth: 4 },
    generates: {
      inspiration: 4,
    },
    isHub: true,
    workersRequired: 0,
    maxWorkers: 0,
  },
  {
    type: "artist",
    id: "workshop",
    name: "Atelier",
    baseCost: 100,
    size: { width: 2.6, height: 1.6, depth: 1.7 },
    color: "#c9a876",
    footprint: { width: 3, depth: 2 },
    workersRequired: 2,
    maxWorkers: 4,
    artistCapacity: 2,
  },
  {
    type: "residential",
    id: "cottage",
    name: "Cottage",
    baseCost: 150,
    size: { width: 1.7, height: 1.4, depth: 1.7 },
    color: "#c1694f",
    footprint: { width: 2, depth: 2 },
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
    footprint: { width: 2, depth: 2 },
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
    footprint: { width: 2, depth: 2 },
    workersRequired: 2,
    maxWorkers: 4,
  },
  {
    type: "materials",
    id: "market",
    name: "Market",
    baseCost: 200,
    size: { width: 3.8, height: 0.9, depth: 3.8 },
    color: "#a9432f",
    footprint: { width: 4, depth: 4 },
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
    footprint: { width: 2, depth: 2 },
    amenities: 20,
    workersRequired: 1,
    maxWorkers: 2,
  },
  {
    type: "service",
    id: "tavern",
    name: "Tavern",
    baseCost: 200,
    size: { width: 2.6, height: 1.6, depth: 1.7 },
    color: "#8c5a3c",
    footprint: { width: 3, depth: 2 },
    amenities: 25,
    workersRequired: 1,
    maxWorkers: 2,
  },
  {
    type: "road",
    id: "road",
    name: "Road",
    baseCost: 50,
    size: { width: 1, height: 0.02, depth: 1 },
    color: "#9c8570",
    footprint: { width: 1, depth: 1 },
  },
  {
    type: "decoration",
    id: "tree",
    name: "Tree",
    baseCost: 25,
    size: { width: 0.5, height: 0.7, depth: 0.5 },
    color: "#3f6b3a",
    footprint: { width: 1, depth: 1 },
  },
] as const satisfies ReadonlyArray<BuildingMetadata>;

export type BuildingId = (typeof BUILDING_TYPES)[number]["id"];

/** Footprint in grid space; odd quarter turns swap width/depth for rectangular buildings. */
export function rotatedFootprint(metadata: BuildingMetadata, rotation?: number) {
  const footprint = metadata.footprint ?? { width: 1, depth: 1 };
  return (rotation ?? 0) % 2 === 1
    ? { width: footprint.depth, depth: footprint.width }
    : footprint;
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
