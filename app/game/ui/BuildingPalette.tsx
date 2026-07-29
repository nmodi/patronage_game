import { useEffect, useRef, useState } from "react";
import {
  Beer,
  Bell,
  BrickWall,
  Building2,
  Castle,
  ChevronLeft,
  ChevronRight,
  Church,
  Columns3,
  Cross,
  DraftingCompass,
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
import type { BuildingType, Material } from "~/game/types";
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
  loggia: Columns3,
  baptistery: Church,
  bell_tower: Bell,
  workshop: Palette,
  sculpture_workshop: Hammer,
  architect_studio: DraftingCompass,
  cottage: Home,
  townhouse: Building2,
  pigment_trader: Palette,
  marble_supplier: Gem,
  bronze_foundry: Flame,
  timber_yard: Trees,
  stone_quarry: Pickaxe,
  warehouse: Warehouse,
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
  const materials = useGameStore((s) => s.materials);
  const fundedBuilds = useGameStore((s) => s.fundedBuilds);
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

  // Blueprint structures stay hidden until a completed commission funds one.
  const openBuildings = (openCategory ? (BUILDING_METADATA_BY_TYPE[openCategory] ?? []) : []).filter(
    (b) => !b.commissionOnly || fundedBuilds.includes(b.id)
  );
  const selectedCategory = selectedBuilding
    ? CATEGORIES.find(({ type }) =>
        BUILDING_METADATA_BY_TYPE[type]?.some(({ id }) => id === selectedBuilding),
      )?.type
    : null;

  // Paged strip (Cities-style shelf): one slim row windowed to 7 cards,
  // chevrons + mouse wheel to page it, always centered above the bar — no
  // category list ever clips at a screen edge, whatever its length.
  const stripRef = useRef<HTMLDivElement>(null);
  const [strip, setStrip] = useState({ atStart: true, atEnd: true });
  const syncStrip = () => {
    const el = stripRef.current;
    if (!el) return;
    setStrip({
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft >= el.scrollWidth - el.clientWidth - 1,
    });
  };
  useEffect(() => {
    stripRef.current?.scrollTo({ left: 0 });
    syncStrip();
  }, [openCategory]);
  const stripOverflows = !(strip.atStart && strip.atEnd);
  const pageStrip = (dir: number) => {
    const el = stripRef.current;
    el?.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };
  const chevronClass =
    "flex h-[92px] w-7 shrink-0 items-center justify-center rounded border border-wood/50 bg-parchment-deep text-sienna transition hover:bg-wood/30 disabled:opacity-35 disabled:hover:bg-parchment-deep";

  const flyout = (
    <Panel className="flex items-center gap-1.5 py-2!">
      {stripOverflows && (
        <button
          className={chevronClass}
          onClick={() => pageStrip(-1)}
          disabled={strip.atStart}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div
        ref={stripRef}
        onScroll={syncStrip}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
        className="flex max-w-[610px] gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {openBuildings.map(({ id, name, baseCost, buildCost, commissionOnly }) => {
          const buildingId = id as BuildingId;
          const BuildingIcon = BUILDING_ICONS[buildingId] ?? Warehouse;
          const isSelected = selectedBuilding === buildingId;
          const bill = Object.entries(buildCost ?? {});
          // Funded blueprint builds cost no florins — only their material bill.
          const canAfford =
            (commissionOnly || florins >= baseCost) &&
            bill.every(([m, amt]) => materials[m as Material] >= amt);
          return (
            <button
              key={id}
              className={`flex h-[92px] w-[82px] shrink-0 flex-col items-center justify-between rounded border px-1 py-1.5 transition ${
                isSelected
                  ? "border-sienna bg-sienna/10 text-ink"
                  : "border-wood/50 bg-parchment-deep text-ink hover:bg-wood/30"
              } ${canAfford ? "" : "opacity-50"}`}
              onClick={() => setSelectedBuilding(isSelected ? null : buildingId)}
            >
              <span className="line-clamp-2 text-center text-xs font-semibold leading-tight">
                {name}
              </span>
              <BuildingIcon className="h-6 w-6 text-prestige-gold" strokeWidth={1.75} />
              <span className="text-center text-xs leading-tight text-ink-faint">
                {commissionOnly ? (
                  <span className="font-semibold text-prestige-ink">Funded</span>
                ) : (
                  `${baseCost}ƒ`
                )}
                {bill.map(([m, amt]) => (
                  <span key={m} className="block">
                    {amt} {m}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {stripOverflows && (
        <button
          className={chevronClass}
          onClick={() => pageStrip(1)}
          disabled={strip.atEnd}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </Panel>
  );

  // Full-width workbench bar: small-caps "Build" title, squared category chips,
  // and a round Raze medallion that unfurls its name (square = category,
  // circle = action — see .pal-* in app.css).
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {openCategory && openBuildings.length > 0 && (
        <div className="absolute bottom-full left-1/2 mb-2 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2">
          {flyout}
        </div>
      )}
      <Panel
        frameClassName="rounded-none border-x-0 border-b-0"
        className="pal-bar flex items-center"
      >
        <span className="pal-title">Build</span>
        {CATEGORIES.map(({ type, label, icon: Icon }) => {
          if (!BUILDING_METADATA_BY_TYPE[type]?.length) return null;
          const isOpen = openCategory === type;
          const hasSelection = selectedCategory === type;
          return (
            <div key={type} className="relative">
              <button
                className={`pal-tab text-ink ${isOpen || hasSelection ? "is-active" : ""}`}
                onClick={() => setOpenCategory(isOpen ? null : type)}
              >
                <Icon className="h-5 w-5 text-sienna" strokeWidth={1.75} />
                <span className="pal-label">{label}</span>
              </button>
            </div>
          );
        })}
        <span className="flex-1" />
        <span className="pal-div" />
        <button
          className={`pal-raze ${selectedBuilding === RAZE_TOOL ? "is-active" : ""}`}
          title="Clear the lot for new works — salvage half the cost"
          onClick={() => {
            setOpenCategory(null);
            setSelectedBuilding(selectedBuilding === RAZE_TOOL ? null : RAZE_TOOL);
          }}
        >
          <Pickaxe className="h-5 w-5" strokeWidth={1.75} />
          <span className="pal-unfurl" aria-hidden="true">
            <span className="pal-label">Raze</span>
          </span>
        </button>
      </Panel>
    </div>
  );
}
