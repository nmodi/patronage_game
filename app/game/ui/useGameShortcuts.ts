import { useEffect } from "react";

import { BASE_TICK_INTERVAL } from "~/game/constants";
import { useGameStore } from "~/stores/useGameStore";

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")
  );
}

function isNativeSpaceTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest("button, a, [role='button'], [role='link']"));
}

export function useGameShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat || isTextEntryTarget(event.target)) return;

      if (event.key === " " || event.key === "Spacebar") {
        if (isNativeSpaceTarget(event.target)) return;
        event.preventDefault();
        useGameStore.getState().togglePause();
        return;
      }

      const speed = Number(event.key);
      if (speed >= 1 && speed <= 3) {
        useGameStore.getState().setPaused(false);
        useGameStore.getState().setTickInterval(BASE_TICK_INTERVAL / speed);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
