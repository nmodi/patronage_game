import { useState } from "react";
import { Coins, Crown, Pause, Play, RotateCcw, Settings, Sparkles, Users } from "lucide-react";

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
  const resetGame = useGameStore((s) => s.resetGame);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="pointer-events-none fixed top-0 left-0 right-0 z-50">
      <Panel
        frameClassName="rounded-none border-x-0 border-t-0"
        className="flex items-center justify-between gap-4 py-1.5!"
      >
        <div className="flex items-center gap-4">
        {/* Fixed width so variable-width month names don't resize the card. */}
        <span className="w-24 whitespace-nowrap font-display text-lg font-semibold text-ink">
          {calendarLabel}
        </span>
        <div className="flex items-center gap-1 border-l border-wood/50 pl-3">
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
        </div>

        <div className="flex items-center gap-6">
          <ResourceStat icon={Coins} label="Florins" value={`${florins}ƒ`} iconClassName="text-prestige-gold" />
          <ResourceStat icon={Sparkles} label="Inspiration" value={inspiration} iconClassName="text-sienna" />
          <ResourceStat icon={Crown} label="Prestige" value={prestige} iconClassName="text-prestige-gold" />
          <ResourceStat
            icon={Users}
            label="Population"
            value={`${population}/${housing}`}
            iconClassName="text-sienna"
            valueClassName={population >= housing ? "text-sienna" : undefined}
          />
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
            <span className="text-center text-xs text-ink-faint">v0.1</span>
          </Panel>
        </div>
      )}
    </div>
  );
}
