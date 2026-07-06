import { Coins, Pause, Play, Sparkles, Users } from "lucide-react";

import { useGameStore } from "~/stores/useGameStore";
import { BASE_TICK_INTERVAL, GAME_SPEED_MULTIPLIERS } from "~/game/constants";
import { Panel } from "./Panel";
import { ResourceStat } from "./ResourceStat";

export function TopBar() {
  const florins = useGameStore((s) => s.florins);
  const inspiration = useGameStore((s) => s.inspiration);
  const addFlorins = useGameStore((s) => s.addFlorins);
  const calendarLabel = useGameStore((s) => s.getCalendarLabel());
  const paused = useGameStore((s) => s.paused);
  const togglePause = useGameStore((s) => s.togglePause);
  const tickInterval = useGameStore((s) => s.tickInterval);
  const setTickInterval = useGameStore((s) => s.setTickInterval);
  const population = useGameStore((s) => s.population);
  const housing = useGameStore((s) => s.getHousing());

  return (
    <div className="pointer-events-none fixed top-4 left-4 right-4 z-50 flex items-start justify-between gap-4">
      <Panel className="flex items-center gap-4">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wide text-stone-500">Date</span>
          <span className="font-display text-lg font-semibold text-stone-800">{calendarLabel}</span>
        </div>
        <div className="flex items-center gap-1 border-l border-stone-300/60 pl-3">
          <button
            className="rounded-full bg-stone-800 p-2 text-stone-50 transition hover:bg-stone-700"
            onClick={togglePause}
            aria-label={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          {GAME_SPEED_MULTIPLIERS.map((multiplier) => {
            const interval = BASE_TICK_INTERVAL / multiplier;
            const isActive = tickInterval === interval;
            return (
              <button
                key={multiplier}
                className={`rounded-full px-2 py-1 text-xs font-semibold transition ${
                  isActive ? "bg-amber-600 text-white" : "bg-stone-200 text-stone-600 hover:bg-stone-300"
                }`}
                onClick={() => setTickInterval(BASE_TICK_INTERVAL / multiplier)}
              >
                {multiplier}x
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel className="flex items-center gap-6">
        <ResourceStat icon={Coins} label="Florins" value={`${florins}ƒ`} />
        <ResourceStat icon={Users} label="Population" value={`${population}/${housing}`} />
        <ResourceStat icon={Sparkles} label="Inspiration" value={inspiration} />
      </Panel>

      <Panel className="flex items-center gap-2 text-xs text-stone-500">
        <span>v0.1</span>
        <button
          className="rounded-full bg-emerald-700 px-3 py-1 font-semibold text-white transition hover:bg-emerald-600"
          onClick={() => addFlorins(100)}
        >
          +100 Debug
        </button>
      </Panel>
    </div>
  );
}
