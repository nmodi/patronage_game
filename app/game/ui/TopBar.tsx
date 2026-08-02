import { useState } from "react";
import { Coins, Feather, Pause, Pencil, Play, Settings } from "lucide-react";

import { isDemo, useGameStore } from "~/stores/useGameStore";
import { BASE_TICK_INTERVAL, GAME_SPEED_MULTIPLIERS } from "~/game/constants";
import { Panel } from "./Panel";
import { ResourceStat } from "./ResourceStat";
import { SettingsMenu } from "./SettingsMenu";
import { PopulationStat, PrestigeStat } from "./TopBarStats";

export function TopBar() {
  const florins = useGameStore((s) => s.florins);
  const inspiration = useGameStore((s) => s.inspiration);
  const addFlorins = useGameStore((s) => s.addFlorins);
  const calendarLabel = useGameStore((s) => s.getCalendarLabel());
  const paused = useGameStore((s) => s.paused);
  const togglePause = useGameStore((s) => s.togglePause);
  const tickInterval = useGameStore((s) => s.tickInterval);
  const setTickInterval = useGameStore((s) => s.setTickInterval);
  const cityName = useGameStore((s) => s.cityName);
  const setCityName = useGameStore((s) => s.setCityName);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

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
          {paused ? <span className="italic text-sienna">Paused</span> : calendarLabel}
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
                className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
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
            <PrestigeStat />
            <PopulationStat />
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
      {settingsOpen && <SettingsMenu onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
