import { useState } from "react";
import {
  Beer,
  Building2,
  Footprints,
  Gem,
  Hammer,
  Home,
  Landmark,
  Milestone,
  Palette,
  Route,
  Store,
  TreePine,
  Warehouse,
  Wheat,
  type LucideIcon,
} from "lucide-react";

import { BUILDING_METADATA_BY_TYPE, type BuildingId } from "~/game/buildings";
import type { BuildingType } from "~/game/types";
import { useGameStore } from "~/stores/useGameStore";
import { Panel } from "./Panel";

const CATEGORIES: Array<{ type: BuildingType; label: string; icon: LucideIcon }> = [
  { type: "road", label: "Roads", icon: Route },
  { type: "city", label: "Civic", icon: Landmark },
  { type: "residential", label: "Housing", icon: Home },
  { type: "service", label: "Services", icon: Wheat },
  { type: "artist", label: "Workshops", icon: Palette },
  { type: "materials", label: "Materials", icon: Hammer },
  { type: "decoration", label: "Decorations", icon: TreePine },
];

const BUILDING_ICONS: Record<BuildingId, LucideIcon> = {
  town_center_plaza: Landmark,
  plaza: Landmark,
  workshop: Hammer,
  cottage: Home,
  townhouse: Building2,
  pigment_trader: Palette,
  marble_supplier: Gem,
  market: Store,
  bakery: Wheat,
  tavern: Beer,
  path: Footprints,
  road: Route,
  avenue: Milestone,
  tree: TreePine,
};

export function BuildingPalette() {
  const selectedBuilding = useGameStore((s) => s.map.selectedBuilding);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const florins = useGameStore((s) => s.florins);
  const [openCategory, setOpenCategory] = useState<BuildingType | null>(null);

  const openBuildings = openCategory ? (BUILDING_METADATA_BY_TYPE[openCategory] ?? []) : [];
  const selectedCategory = selectedBuilding
    ? CATEGORIES.find(({ type }) =>
        BUILDING_METADATA_BY_TYPE[type]?.some(({ id }) => id === selectedBuilding),
      )?.type
    : null;

  return (
    <div className="fixed bottom-0 left-1/2 z-50 -translate-x-1/2">
      <Panel
        frameClassName="rounded-lg rounded-b-none border-b-0"
        className="flex gap-1.5 pb-2!"
      >
        {CATEGORIES.map(({ type, label, icon: Icon }) => {
          if (!BUILDING_METADATA_BY_TYPE[type]?.length) return null;
          const isOpen = openCategory === type;
          const hasSelection = selectedCategory === type;
          return (
            <div key={type} className="relative">
              {isOpen && openBuildings.length > 0 && (
                <div className="absolute bottom-full left-0 mb-4 w-max">
                  <Panel className="flex gap-1.5">
                    {openBuildings.map(({ id, name, baseCost }) => {
                      const buildingId = id as BuildingId;
                      const BuildingIcon = BUILDING_ICONS[buildingId] ?? Warehouse;
                      const isSelected = selectedBuilding === buildingId;
                      const canAfford = florins >= baseCost;
                      return (
                        <button
                          key={id}
                          className={`flex h-28 w-24 min-w-0 shrink-0 flex-col items-center justify-between rounded-md border px-1.5 py-2 transition ${
                            isSelected
                              ? "border-sienna bg-white/80 text-ink"
                              : "border-wood/60 bg-white/50 text-ink hover:bg-white/80"
                          } ${canAfford ? "" : "opacity-50"}`}
                          onClick={() => setSelectedBuilding(isSelected ? null : buildingId)}
                        >
                          <span className="flex h-9 items-center text-center text-sm font-semibold leading-tight">
                            {name}
                          </span>
                          <BuildingIcon className="h-7 w-7 text-prestige-gold" strokeWidth={1.75} />
                          <span className="text-xs text-ink-faint">{baseCost}ƒ</span>
                        </button>
                      );
                    })}
                  </Panel>
                </div>
              )}
              <button
                className={`flex flex-col items-center gap-1 rounded-md border px-3 py-2 transition ${
                  isOpen || hasSelection
                    ? "border-sienna bg-white/80 text-ink"
                    : "border-wood/60 bg-white/50 text-ink hover:bg-white/80"
                }`}
                onClick={() => setOpenCategory(isOpen ? null : type)}
              >
                <Icon className="h-5 w-5 text-sienna" strokeWidth={1.75} />
                <span className="font-display text-xs font-semibold tracking-wider">{label}</span>
              </button>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
