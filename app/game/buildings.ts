import type { BuildingType, BuildingMetadata } from "./types";

export const BUILDING_TYPES = [
  {
    type: "city",
    id: "town_center_plaza",
    name: "Town Center Plaza",
    baseCost: 600,
    size: { width: 4.9, height: 0.05, depth: 4.9 },
    color: "#d9b877",
    footprint: { width: 5, depth: 5 },
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
    size: { width: 2.9, height: 0.05, depth: 2.9 },
    color: "#d9b877",
    footprint: { width: 3, depth: 3 },
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
    name: "Workshop",
    baseCost: 100,
    size: { width: 1, height: 1, depth: 1 },
    color: "#c9a876",
    footprint: { width: 1, depth: 1 },
    workersRequired: 2,
    maxWorkers: 4,
  },
  {
    type: "residential",
    id: "cottage",
    name: "Cottage",
    baseCost: 150,
    size: { width: 0.85, height: 0.8, depth: 0.85 },
    color: "#c1694f",
    footprint: { width: 1, depth: 1 },
    // generates: {
    //   income: 5,
    // },
    populationCapacity: 4,
    workersRequired: 0,
    maxWorkers: 0,
  },
  {
    type: "residential",
    id: "townhouse",
    name: "Townhouse",
    baseCost: 400,
    size: { width: 0.85, height: 1.2, depth: 0.85 },
    color: "#a8503a",
    footprint: { width: 1, depth: 1 },
    // generates: {
    //   income: 5,
    // },
    populationCapacity: 8,
    workersRequired: 0,
    maxWorkers: 0,
  },
  {
    type: "materials",
    id: "pigment_trader",
    name: "Pigment Trader",
    baseCost: 200,
    size: { width: 0.8, height: 1.5, depth: 0.8 },
    color: "#b98d54",
    footprint: { width: 1, depth: 1 },
    workersRequired: 2,
    maxWorkers: 4,
  },
  {
    type: "materials",
    id: "market",
    name: "Market",
    baseCost: 200,
    size: { width: 1.8, height: 0.8, depth: 1.8 },
    color: "#a9432f",
    footprint: { width: 2, depth: 2 },
    generates: {
      income: 10,
    },
    workersRequired: 3,
    maxWorkers: 6,
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
