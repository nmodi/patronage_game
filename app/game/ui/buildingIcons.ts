// Pure data: the palette's category tabs and per-building/material/artist icons.
import {
  Beer,
  Bell,
  BrickWall,
  Building2,
  Castle,
  Church,
  Columns3,
  Cross,
  DraftingCompass,
  Droplets,
  Fence,
  Footprints,
  Gem,
  Grape,
  Hammer,
  Home,
  Landmark,
  Medal,
  Mountain,
  Palette,
  PersonStanding,
  Powder,
  Pyramid,
  Road,
  Rock,
  Shovel,
  Shrub,
  Store,
  Tent,
  TreeDeciduous,
  TreePine,
  Trees,
  Village,
  Warehouse,
  Waves,
  Wheat,
  WoodBeam,
  type IconComponent,
} from "./gameIcons";

import type { BuildingId } from "~/game/buildings";
import type { BuildingType, Material } from "~/game/types";

// ponytail: placeholder glyphs until materials get bespoke art.
export const MATERIAL_ICONS: Record<Material, IconComponent> = {
  pigment: Powder,
  marble: Gem,
  bronze: Medal,
  timber: WoodBeam,
  stone: Rock,
};

// Material tints for the navy materials rail — picked to read on #14161f/#212533.
export const MATERIAL_COLORS: Record<Material, string> = {
  pigment: "#6a9ce6", // ultramarine
  marble: "#f2ecdf",
  bronze: "#b3902f",
  timber: "#a67a4e",
  stone: "#a3a49f",
};

export const ARTIST_ICONS: Record<string, IconComponent> = {
  painter: Palette,
  sculptor: Hammer,
  architect: DraftingCompass,
};

export const CATEGORIES: Array<{ type: BuildingType; label: string; icon: IconComponent }> = [
  { type: "road", label: "Roads", icon: Footprints },
  { type: "city", label: "Civic", icon: Landmark },
  { type: "residential", label: "Housing", icon: Village },
  { type: "service", label: "Services", icon: Wheat },
  { type: "artist", label: "Workshops", icon: Palette },
  { type: "materials", label: "Materials", icon: Hammer },
  { type: "decoration", label: "Decorations", icon: TreePine },
];

export const BUILDING_ICONS: Record<BuildingId, IconComponent> = {
  town_center_plaza: Landmark,
  plaza: Landmark,
  small_plaza: Landmark,
  palazzo: Castle,
  cathedral: Church,
  chapel: Cross,
  bell_tower: Bell,
  workshop: Palette,
  sculpture_workshop: Hammer,
  architect_studio: DraftingCompass,
  cottage: Home,
  townhouse: Building2,
  // Suppliers wear their material's icon so rail and palette read as one system.
  pigment_trader: MATERIAL_ICONS.pigment,
  marble_supplier: MATERIAL_ICONS.marble,
  bronze_foundry: MATERIAL_ICONS.bronze,
  timber_yard: MATERIAL_ICONS.timber,
  stone_quarry: MATERIAL_ICONS.stone,
  warehouse: Warehouse,
  market: Store,
  bakery: Wheat,
  tavern: Beer,
  market_stall: Tent,
  dirt_path: Shovel,
  path: Road,
  road: Road,
  avenue: Road,
  bridge: Waves,
  tree: TreeDeciduous,
  cypress: TreePine,
  vineyard: Grape,
  fountain: Droplets,
  colonnade: Columns3,
  obelisk: Pyramid,
  olive_grove: Trees,
  bush: Shrub,
  rocks: Mountain,
  boulder: Mountain,
  fence: Fence,
  stone_wall: BrickWall,
  sculpture_display: PersonStanding,
};
