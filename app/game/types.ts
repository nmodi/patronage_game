export type BuildingType =
  | "empty"
  | "residential"
  | "artist"
  | "materials"
  | "road"
  | "city"
  | "decoration";

export interface BuildingMetadata {
  type: BuildingType;
  id: string;
  name: string;
  baseCost: number;
  description?: string;
  size: {
    width: number;
    height: number;
    depth: number;
  };
  color: string;
  footprint: {
    width: number;
    depth: number;
  };
  generates?: {
    income?: number;
    inspiration?: number;
  };
  populationCapacity?: number;
  isHub?: boolean;
  workersRequired?: number;
  maxWorkers?: number;
}

export interface Citizen {
    id: string;
    name: string;
    age: number;
    occupation: string;
}
