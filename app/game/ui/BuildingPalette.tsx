import { useEffect, useState } from "react";
import {
  Beer,
  Bell,
  BrickWall,
  Building2,
  Castle,
  Church,
  Columns3,
  Cross,
  Droplets,
  Fence,
  Flame,
  Footprints,
  Gem,
  Grape,
  Hammer,
  Home,
  Landmark,
  Milestone,
  Mountain,
  Palette,
  PersonStanding,
  Pickaxe,
  Pyramid,
  Route,
  Shovel,
  Shrub,
  Store,
  Tent,
  TreeDeciduous,
  TreePine,
  Trees,
  Warehouse,
  Waves,
  Wheat,
  type LucideIcon,
} from "lucide-react";

import { BUILDING_METADATA_BY_TYPE, type BuildingId } from "~/game/buildings";
import type { BuildingType } from "~/game/types";
import { RAZE_TOOL, useGameStore } from "~/stores/useGameStore";
import { Panel } from "./Panel";
import { isTextEntryTarget } from "./useGameShortcuts";

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
  small_plaza: Landmark,
  palazzo: Castle,
  cathedral: Church,
  chapel: Cross,
  bell_tower: Bell,
  workshop: Palette,
  sculpture_workshop: Hammer,
  cottage: Home,
  townhouse: Building2,
  pigment_trader: Palette,
  marble_supplier: Gem,
  bronze_foundry: Flame,
  market: Store,
  bakery: Wheat,
  tavern: Beer,
  market_stall: Tent,
  dirt_path: Shovel,
  path: Footprints,
  road: Route,
  avenue: Milestone,
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

export function BuildingPalette({
  hasOpenPanel,
  onClosePanel,
}: {
  hasOpenPanel?: boolean;
  onClosePanel?: () => void;
}) {
  const selectedBuilding = useGameStore((s) => s.map.selectedBuilding);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const florins = useGameStore((s) => s.florins);
  const [openCategory, setOpenCategory] = useState<BuildingType | null>(null);

  useEffect(() => {
    // Layered cancel: 1st press drops placement, 2nd closes the flyout.
    function cancel(): boolean {
      const { map, setSelectedBuilding } = useGameStore.getState();
      if (map.selectedBuilding) {
        setSelectedBuilding(null);
        return true;
      }
      if (openCategory) {
        setOpenCategory(null);
        return true;
      }
      if (hasOpenPanel) {
        onClosePanel?.();
        return true;
      }
      return false;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTextEntryTarget(e.target)) return;
      // Esc is taken by macOS fullscreen, hence the alternates.
      if (e.key === "Escape" || e.key === "Backspace" || e.key === "`") {
        if (cancel()) e.preventDefault();
      }
    }
    function onContextMenu(e: MouseEvent) {
      if (isTextEntryTarget(e.target)) return;
      if (cancel()) e.preventDefault(); // browser menu only when nothing to cancel
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [openCategory, hasOpenPanel, onClosePanel]);

  const openBuildings = openCategory ? (BUILDING_METADATA_BY_TYPE[openCategory] ?? []) : [];
  const selectedCategory = selectedBuilding
    ? CATEGORIES.find(({ type }) =>
        BUILDING_METADATA_BY_TYPE[type]?.some(({ id }) => id === selectedBuilding),
      )?.type
    : null;

  // Long lists center over the palette (capped to the viewport, scrollable);
  // short ones anchor to their tab.
  const centerFlyout = openBuildings.length >= 8;
  const flyout = (
    <Panel className="flex gap-1.5 overflow-x-auto">
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
  );

  return (
    <div className="fixed bottom-0 left-1/2 z-50 -translate-x-1/2">
      {openCategory && centerFlyout && openBuildings.length > 0 && (
        <div className="absolute bottom-full left-1/2 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2">
          {flyout}
        </div>
      )}
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
              {isOpen && !centerFlyout && openBuildings.length > 0 && (
                <div
                  // mb-3 clears the category panel's top padding so the panels
                  // just touch; last tab's list overflows the viewport if left-aligned.
                  className={`absolute bottom-full mb-3 w-max ${type === "decoration" ? "right-0" : "left-0"}`}
                >
                  {flyout}
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
        <button
          className={`flex flex-col items-center gap-1 rounded-md border px-3 py-2 transition ${
            selectedBuilding === RAZE_TOOL
              ? "border-sienna bg-white/80 text-ink"
              : "border-wood/60 bg-white/50 text-ink hover:bg-white/80"
          }`}
          title="Clear the lot for new works — salvage half the cost"
          onClick={() => {
            setOpenCategory(null);
            setSelectedBuilding(selectedBuilding === RAZE_TOOL ? null : RAZE_TOOL);
          }}
        >
          <Pickaxe className="h-5 w-5 text-sienna" strokeWidth={1.75} />
          <span className="font-display text-xs font-semibold tracking-wider">Raze</span>
        </button>
      </Panel>
    </div>
  );
}
