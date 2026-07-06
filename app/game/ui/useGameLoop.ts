import { useEffect } from "react";

import { useGameStore } from "~/stores/useGameStore";

export function useGameLoop() {
  const tick = useGameStore((s) => s.tick);
  const isPaused = useGameStore((s) => s.paused);
  const tickInterval = useGameStore((s) => s.tickInterval);

  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(tick, tickInterval);
    return () => clearInterval(id);
  }, [tick, isPaused, tickInterval]);
}
