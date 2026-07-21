import { useMemo, useState } from "react";
import { Check, Coins, Copy, Crown, Feather, Home, Info, Pause, Pencil, Play, RotateCcw, Settings, Store, Users } from "lucide-react";

import { isDemo, useGameStore } from "~/stores/useGameStore";
import { getWater, type WaterArchetype } from "~/game/water";
import {
  BASE_TICK_INTERVAL,
  GAME_SPEED_MULTIPLIERS,
  RENAISSANCE_NOBLE_HOUSES,
  RENAISSANCE_PRESTIGE,
} from "~/game/constants";
import { computeDisplaySummary } from "~/game/display";
import { computeCityMetrics } from "~/game/metrics";
import { deriveSimTiles } from "~/game/roadRaster";
import { renaissanceProgress } from "~/game/renaissance";
import type { Artwork } from "~/game/types";

// Also the main menu's map-picker options (MainMenu.tsx).
export const ARCHETYPE_LABELS: Record<WaterArchetype, string> = {
  dry: "Dry plain",
  inland: "Inland river",
  coastal: "Coastal",
  "scenic-river": "Distant river",
  "scenic-coast": "Distant coast",
};
import { Panel } from "./Panel";
import { ResourceStat } from "./ResourceStat";

export function TopBar() {
  const florins = useGameStore((s) => s.florins);
  const inspiration = useGameStore((s) => s.inspiration);
  const prestige = useGameStore((s) => s.prestige);
  const addFlorins = useGameStore((s) => s.addFlorins);
  const calendarLabel = useGameStore((s) => s.getCalendarLabel());
  const paused = useGameStore((s) => s.paused);
  const togglePause = useGameStore((s) => s.togglePause);
  const tickInterval = useGameStore((s) => s.tickInterval);
  const setTickInterval = useGameStore((s) => s.setTickInterval);
  const population = useGameStore((s) => s.population);
  const tiles = useGameStore((s) => s.map.tiles);
  const roads = useGameStore((s) => s.map.roads);
  const artworks = useGameStore((s) => s.artworks);
  const { housing, amenities } = useMemo(
    () =>
      computeCityMetrics(
        deriveSimTiles(tiles, roads),
        undefined,
        computeDisplaySummary(tiles, artworks).counts,
        population
      ),
    [tiles, roads, artworks, population]
  );
  const resetGame = useGameStore((s) => s.resetGame);
  const cityName = useGameStore((s) => s.cityName);
  const setCityName = useGameStore((s) => s.setCityName);
  const seed = useGameStore((s) => s.seed);
  const mapSeed = useGameStore((s) => s.mapSeed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [seedCopied, setSeedCopied] = useState(false);

  const copySeed = () => {
    // ponytail: seeds are stored lowercase; shown/copied uppercase for readability.
    // Harmless now (no seed-input UI) — a future "load seed" must lowercase on input.
    navigator.clipboard?.writeText(seed.toUpperCase());
    setSeedCopied(true);
    setTimeout(() => setSeedCopied(false), 1200);
  };

  const commitName = () => {
    const name = nameDraft.trim();
    if (name) setCityName(name); // blank keeps the existing name
    setEditingName(false);
  };

  return (
    <div className="pointer-events-none fixed top-0 left-0 right-0 z-50">
      <Panel
        frameClassName="rounded-none border-x-0 border-t-0"
        className="flex items-center justify-between gap-4 py-1.5!"
      >
        <div className="flex items-center gap-4">
        {editingName ? (
          <input
            autoFocus
            maxLength={30}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setEditingName(false);
            }}
            className="w-40 border-b border-wood/50 bg-transparent font-display text-lg font-semibold text-ink outline-none focus:border-sienna"
          />
        ) : (
          <button
            className="group flex items-center gap-2 font-display text-lg font-semibold text-ink"
            onClick={() => {
              setNameDraft(cityName);
              setEditingName(true);
            }}
            aria-label="Rename city"
          >
            {cityName}
            <Pencil className="h-4 w-4 text-ink-faint transition group-hover:text-ink" />
          </button>
        )}
        {/* Fixed width so variable-width month names don't resize the card. */}
        <span className="w-24 whitespace-nowrap border-l border-wood/50 pl-3 font-display text-lg font-semibold text-ink">
          {calendarLabel}
        </span>
        <div className="flex items-center gap-1">
          <button
            className={`rounded-full p-2 transition ${
              paused
                ? "bg-sienna text-parchment"
                : "bg-parchment-deep text-ink-faint hover:text-ink"
            }`}
            onClick={togglePause}
            aria-label={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          {GAME_SPEED_MULTIPLIERS.map((multiplier) => {
            const interval = BASE_TICK_INTERVAL / multiplier;
            const isActive = !paused && tickInterval === interval;
            return (
              <button
                key={multiplier}
                className={`rounded-full px-2 py-1 text-xs font-semibold transition ${
                  isActive ? "bg-sienna text-parchment" : "bg-parchment-deep text-ink-faint hover:text-ink"
                }`}
                onClick={() => setTickInterval(BASE_TICK_INTERVAL / multiplier)}
              >
                {multiplier}x
              </button>
            );
          })}
          </div>
          <div className="flex items-center gap-6 border-l border-wood/50 pl-4">
            <ResourceStat icon={Coins} label="Florins" value={`${florins}ƒ`} iconClassName="text-prestige-gold" />
            <ResourceStat icon={Feather} label="Inspiration" value={inspiration} iconClassName="text-sienna" />
            <PrestigeStat prestige={prestige} artworks={artworks} />
            <PopulationStat population={population} housing={housing} amenities={amenities} />
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-ink-faint">
          {isDemo() && (
            <button
              className="rounded-full px-2 py-1 font-semibold text-ink-faint transition hover:text-ink"
              onClick={() => addFlorins(100)}
            >
              +100ƒ
            </button>
          )}
          <button
            className="rounded-full bg-parchment-deep p-2 text-ink transition hover:bg-wood/40"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </Panel>
      {settingsOpen && (
        <div className="absolute right-4 top-full mt-2">
          <Panel header="Settings" className="flex w-48 flex-col gap-2 text-sm">
            <button
              className="flex items-center gap-2 rounded-lg bg-parchment-deep px-3 py-2 font-semibold text-ink transition hover:bg-wood/40"
              // ponytail: full reload = the one clean path back to the menu — drops
              // transient UI state and exits ?demo mode uniformly; the save is
              // already persisted (every set writes through).
              onClick={() => window.location.assign("/")}
            >
              <Home className="h-4 w-4" />
              Main Menu
            </button>
            <button
              className="flex items-center gap-2 rounded-lg bg-sienna px-3 py-2 font-semibold text-parchment transition hover:bg-sienna/85"
              onClick={() => {
                if (window.confirm("Restart the game? All progress will be lost.")) {
                  resetGame();
                  setSettingsOpen(false);
                }
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Restart Game
            </button>
            <button
              className="flex items-center justify-center gap-1.5 text-center text-xs tracking-wide text-ink-faint transition hover:text-ink"
              onClick={copySeed}
              title="Copy seed"
            >
              Seed: {seed.toUpperCase()}
              {seedCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
            {mapSeed != null && (
              <span className="text-center text-xs text-ink-faint">
                Map: {ARCHETYPE_LABELS[getWater(mapSeed)!.archetype]}
              </span>
            )}
            <span className="text-center text-xs text-ink-faint">v0.1</span>
          </Panel>
        </div>
      )}
    </div>
  );
}

function PopulationStat({
  population,
  housing,
  amenities,
}: {
  population: number;
  housing: number;
  amenities: number;
}) {
  // The lower of the two caps is what growth is heading toward.
  const limiter =
    housing === amenities ? null : amenities < housing ? "amenities" : "housing";

  return (
    <div className="group relative flex items-center gap-2.5">
      <Users className="h-6 w-6 text-sienna" strokeWidth={2} />
      <div className="flex flex-col leading-tight">
        <span className="text-xl font-semibold text-ink">{population}</span>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
          Population
          <Info className="h-3 w-3" />
        </span>
      </div>
      <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden group-hover:block">
        <Panel className="w-56 text-sm">
          <div className="flex flex-col gap-1.5 normal-case">
            <Row label="Housing capacity" value={housing} />
            <Row label="Amenity capacity" value={amenities} />
          </div>
          {limiter && (
            <div className="mt-2.5 flex items-center gap-2 border-t border-wood/50 pt-2.5 text-xs italic text-ink-faint">
              {limiter === "amenities" ? (
                <Store className="h-4 w-4 shrink-0 text-sienna" />
              ) : (
                <Home className="h-4 w-4 shrink-0 text-sienna" />
              )}
              {limiter === "amenities" ? "Amenities are" : "Housing is"} limiting growth.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// Prestige chip + the Renaissance milestone checklist on hover (Phase 12) —
// the multi-gate goal stays visible instead of being a hidden wall.
function PrestigeStat({ prestige, artworks }: { prestige: number; artworks: Artwork[] }) {
  const artists = useGameStore((s) => s.artists);
  const reached = useGameStore((s) => s.renaissanceReached);
  const progress = useMemo(
    () => renaissanceProgress(prestige, artists, artworks),
    [prestige, artists, artworks]
  );

  return (
    <div className="group relative flex items-center gap-2.5">
      <Crown className="h-6 w-6 text-prestige-gold" strokeWidth={2} />
      <div className="flex flex-col leading-tight">
        <span className="text-xl font-semibold text-ink">{Math.floor(prestige)}</span>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
          Prestige
          <Info className="h-3 w-3" />
        </span>
      </div>
      <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden group-hover:block">
        <Panel className="w-64 text-sm">
          <div className="font-display font-semibold text-ink">
            {reached ? "The Golden Age" : "The Renaissance"}
          </div>
          <div className="mt-1.5 flex flex-col gap-1.5 normal-case">
            <CheckRow
              label="Prestige"
              met={progress.prestige}
              detail={`${Math.floor(prestige)} / ${RENAISSANCE_PRESTIGE}`}
            />
            <CheckRow label="A Master among your artists" met={progress.master} />
            <CheckRow
              label="A Wonder on display"
              met={progress.wonder != null}
              detail={progress.wonder ? `“${progress.wonder.name}”` : undefined}
            />
            <CheckRow label="A work for the Church" met={progress.church} />
            <CheckRow
              label="Works for noble houses"
              met={progress.nobleHouses >= RENAISSANCE_NOBLE_HOUSES}
              detail={`${Math.min(progress.nobleHouses, RENAISSANCE_NOBLE_HOUSES)} / ${RENAISSANCE_NOBLE_HOUSES}`}
            />
          </div>
          {reached && (
            <div className="mt-2.5 border-t border-wood/50 pt-2.5 text-xs italic text-ink-faint">
              The city lives its Golden Age.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function CheckRow({ label, met, detail }: { label: string; met: boolean; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-ink-faint">{label}</span>
      <span
        className={`flex min-w-0 items-baseline gap-1 font-semibold ${met ? "text-ink" : "text-ink-faint"}`}
      >
        {detail && <span className="truncate">{detail}</span>}
        {met && <Check className="h-3.5 w-3.5 shrink-0 self-center text-sienna" />}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-faint">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
