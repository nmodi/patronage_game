export type BuildingType =
  | "empty"
  | "residential"
  | "artist"
  | "materials"
  | "service"
  | "road"
  | "city"
  | "decoration";

export type ArtistType = "painter" | "sculptor" | "architect" | "illuminator";
export type ArtistRank = "apprentice" | "journeyman" | "master";

export interface Artist {
  id: string;
  name: string;
  type: ArtistType;
  rank: ArtistRank;
  homeTileKey: string; // origin key "x,y" of the hosting workshop
  xp?: number; // completed artworks; undefined = 0 (pre-Phase-6 saves)
  workProgress?: number; // fractional months of the workshop's current artwork; set only on the founding artist
}

export interface Artwork {
  id: string;
  name: string;
  artistId: string;
  artistType: ArtistType;
  completedTick: number;
}

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
  artistCapacity?: number; // how many artists this workshop can host
  supplies?: { artistType: ArtistType; capacity: number }; // supplier: N concurrently-working artists
}
