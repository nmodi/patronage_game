import { Hammer, Home, Landmark, Palette, Route, TreePine, Wheat, type LucideIcon } from "lucide-react";

import { BUILDING_METADATA_BY_TYPE, type BuildingId } from "~/game/buildings";
import type { BuildingType } from "~/game/types";
import { useGameStore } from "~/stores/useGameStore";
import { Panel } from "./Panel";

const CATEGORIES: Array<{ type: BuildingType; label: string; icon: LucideIcon }> = [
  { type: "residential", label: "Housing", icon: Home },
  { type: "artist", label: "Workshops", icon: Palette },
  { type: "materials", label: "Supplies", icon: Hammer },
  { type: "service", label: "Services", icon: Wheat },
  { type: "city", label: "Civic", icon: Landmark },
  { type: "decoration", label: "Decorations", icon: TreePine },
  { type: "road", label: "Roads", icon: Route },
];

export function BuildingPalette() {
  const selectedBuilding = useGameStore((s) => s.map.selectedBuilding);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const florins = useGameStore((s) => s.florins);

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <Panel className="flex items-start gap-5">
        {CATEGORIES.map(({ type, label, icon: Icon }) => {
          const buildings = BUILDING_METADATA_BY_TYPE[type];
          if (!buildings?.length) return null;
          return (
            <div key={type} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
              <div className="flex gap-1.5">
                {buildings.map(({ id, name, baseCost }) => {
                  const buildingId = id as BuildingId;
                  const isSelected = selectedBuilding === buildingId;
                  const canAfford = florins >= baseCost;
                  return (
                    <button
                      key={id}
                      className={`flex flex-col items-start rounded-lg border px-3 py-2 transition ${
                        isSelected
                          ? "border-amber-600 bg-amber-100 text-stone-900"
                          : "border-stone-300/60 bg-white/60 text-stone-700 hover:bg-amber-50"
                      } ${canAfford ? "" : "opacity-50"}`}
                      onClick={() => setSelectedBuilding(isSelected ? null : buildingId)}
                    >
                      <span className="text-xs font-semibold">{name}</span>
                      <span className="text-[10px] text-stone-500">{baseCost}ƒ</span>
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
