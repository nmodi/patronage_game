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
  { type: "residential", label: "Housing", icon: Home },
  { type: "artist", label: "Workshops", icon: Palette },
  { type: "materials", label: "Materials", icon: Hammer },
  { type: "service", label: "Services", icon: Wheat },
  { type: "city", label: "Civic", icon: Landmark },
  { type: "decoration", label: "Decorations", icon: TreePine },
  { type: "road", label: "Roads", icon: Route },
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

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <Panel className="flex items-start gap-4">
        {CATEGORIES.map(({ type, label, icon: Icon }, index) => {
          const buildings = BUILDING_METADATA_BY_TYPE[type];
          if (!buildings?.length) return null;
          return (
            <div
              key={type}
              className={`flex flex-col gap-1.5 ${index > 0 ? "border-l border-wood/40 pl-4" : ""}`}
            >
              <div className="flex items-center justify-center gap-1.5 font-display text-xs font-semibold tracking-wider text-ink-faint">
                <Icon className="h-3.5 w-3.5 text-sienna" />
                {label}
              </div>
              <div className="flex gap-1.5">
                {buildings.map(({ id, name, baseCost }) => {
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
              </div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
