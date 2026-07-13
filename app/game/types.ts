export type BuildingType =
  | "empty"
  | "residential"
  | "artist"
  | "materials"
  | "service"
  | "road"
  | "city"
  | "decoration";

export type ArtistType = "painter" | "sculptor" | "architect";
export type ArtistRank =
  | "apprentice"
  | "journeyman"
  | "artisan"
  | "virtuoso"
  | "master"
  | "renowned_master"
  | "grand_master";

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
  requester?: string; // who commissioned it; optional for pre-Phase-8 saves
  artistId: string;
  artistType: ArtistType;
  completedTick: number;
  prestige?: number; // commission prestige captured at mint; undefined (pre-Phase-9) = default quality
  displayedAt?: { key: string; slot: number }; // host origin key + slot index; undefined = in storage
}

export type DisplaySlotKind = "painting" | "statue" | "plinth";

export interface DisplaySlotDef {
  kind: DisplaySlotKind;
  // Plinths only: footprint cell the pedestal stands on, in the unrotated
  // (metadata) frame; rotated into the stamped frame by rotateSlotCell.
  // Invariant: plinth hosts must not use randomRotate (all current ones comply).
  cell?: { x: number; y: number };
}

export interface Commission {
  id: string;
  title: string; // artwork name, chosen at offer time
  requester: string; // flavor: "The Church", "House Medici", …
  artistType: ArtistType;
  durationMonths: number;
  florins: number; // payout on completion
  prestige: number;
  expiresTick: number; // open offer vanishes after this tick
  workshopKey?: string; // set on assignment; undefined = open offer
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
  artistType?: ArtistType; // workshops: the only artist type that founds/arrives here
  roadWidth?: number; // roads only: cells stamped perpendicular to the drag axis
  linear?: boolean; // drag-placed like roads: each cell is an independent 1×1 segment tile
  paved?: boolean; // render a flagstone apron over the full footprint (joins plazas visually)
  supplies?: { artistType: ArtistType; capacity: number }; // supplier: N concurrently-working artists
  displaySlots?: readonly DisplaySlotDef[]; // masterwork display sites (Phase 9)
}
