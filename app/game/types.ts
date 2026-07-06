export type BuildingType =
  | "empty"
  | "residential"
  | "artist"
  | "materials"
  | "service"
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
  housing?: number;
  amenities?: number; // raises the population growth ceiling while staffed
  isHub?: boolean;
  workersRequired?: number;
  maxWorkers?: number;
}
