import { useGameStore } from "~/stores/useGameStore";
import { BUILDING_TYPES } from "~/game/buildings";
import { BASE_TICK_INTERVAL, GAME_SPEED_MULTIPLIERS } from "~/game/constants";

export function GameHUD() {
  const florins = useGameStore((s) => s.florins);
  const inspiration = useGameStore((s) => s.inspiration);
  const addFlorins = useGameStore((s) => s.addFlorins);
  const calendarLabel = useGameStore((s) => s.getCalendarLabel());
  const selectedBuilding = useGameStore((s) => s.map.selectedBuilding);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const paused = useGameStore((s) => s.paused);
  const togglePause = useGameStore((s) => s.togglePause);
  const tickInterval = useGameStore((s) => s.tickInterval);
  const setTickInterval = useGameStore((s) => s.setTickInterval);
  const population = useGameStore((s) => s.getPopulationCapacity());

  return (
    <>
      <div
        data-hud="true"
        className="fixed top-0 left-0 right-0 z-50 bg-black/70 backdrop-blur flex items-center justify-between px-6 py-3"
      >
        <div className="flex items-baseline gap-6">
          <div className="flex flex-col">
            <span className="text-xs uppercase text-white/60 tracking-wide">Date</span>
            <span className="text-lg font-semibold text-white">{calendarLabel}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase text-white/60 tracking-wide">Florins</span>
            <span className="text-2xl font-semibold font-mono text-white">{florins}ƒ</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase text-white/60 tracking-wide">Population</span>
            <span className="text-xl font-semibold text-white">{population}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase text-white/60 tracking-wide">Inspiration</span>
            <span className="text-xl font-semibold text-white">{inspiration}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <div className="flex items-center gap-2">
            <span>Speed</span>
            {GAME_SPEED_MULTIPLIERS.map((multiplier) => {
              const interval = BASE_TICK_INTERVAL / multiplier;
              const isActive = tickInterval === interval;
              return (
                <button
                  key={multiplier}
                  className={`px-2 py-1 rounded text-xs font-semibold transition ${
                    isActive ? "bg-blue-500 text-white" : "bg-white/20 text-white/70"
                  }`}
                  onClick={() => setTickInterval(BASE_TICK_INTERVAL / multiplier)}
                >
                  {multiplier}x
                </button>
              );
            })}
          </div>
          <button
            className={`px-4 py-1 rounded text-sm font-semibold transition ${
              paused ? "bg-amber-500/80 text-black" : "bg-white/20 text-white"
            }`}
            onClick={togglePause}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <span>RenCity Builder v0.1</span>
          <button
            className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition"
            onClick={() => addFlorins(100)}
          >
            +100 Debug
          </button>
        </div>
      </div>

      <div
        data-hud="true"
        className="fixed bottom-0 left-0 right-0 z-50 bg-black/70 backdrop-blur px-6 py-4"
      >
        <div className="flex items-center gap-4 overflow-x-auto">
          {BUILDING_TYPES.map(({ id, name, baseCost }) => {
            const isSelected = selectedBuilding === id;
            return (
              <button
                key={id}
                className={`flex flex-col items-start min-w-[120px] px-4 py-3 rounded-lg border transition ${
                  isSelected
                    ? "border-blue-400 bg-blue-600/60 text-white"
                    : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                }`}
                onClick={() => setSelectedBuilding(isSelected ? null : id)}
              >
                <span className="text-sm font-semibold">{name}</span>
                <span className="text-xs text-white/60">Cost: {baseCost}ƒ</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
