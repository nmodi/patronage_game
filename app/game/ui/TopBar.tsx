import { useState } from "react";
import { Check, Coins, Copy, Crown, Home, Info, Pause, Pencil, Play, RotateCcw, Settings, Sparkles, Store, Users } from "lucide-react";

import { isDemo, useGameStore } from "~/stores/useGameStore";
import { BASE_TICK_INTERVAL, GAME_SPEED_MULTIPLIERS } from "~/game/constants";
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
  const housing = useGameStore((s) => s.getHousing());
  const amenities = useGameStore((s) => s.getAmenities());
  const resetGame = useGameStore((s) => s.resetGame);
  const cityName = useGameStore((s) => s.cityName);
  const setCityName = useGameStore((s) => s.setCityName);
  const seed = useGameStore((s) => s.seed);
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
            <ResourceStat icon={Sparkles} label="Inspiration" value={inspiration} iconClassName="text-sienna" />
            <ResourceStat icon={Crown} label="Prestige" value={prestige} iconClassName="text-prestige-gold" />
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

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-faint">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
