import { useEffect } from "react";

import { BASE_TICK_INTERVAL } from "~/game/constants";
import { useGameStore } from "~/stores/useGameStore";

export function isTextEntryTarget(target: EventTarget | null) {
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

  useEffect(() => {
    // Trackpad pinch arrives as ctrl+wheel; unhandled over the DOM HUD it
    // browser-zooms the page and slides the fixed bars off-screen (the canvas
    // already consumes wheel for camera zoom). Cmd +/- keyboard zoom still works.
    function handleWheel(event: WheelEvent) {
      if (event.ctrlKey) event.preventDefault();
    }
    const handleGesture = (event: Event) => event.preventDefault(); // Safari's gesture events
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("gesturestart", handleGesture);
    window.addEventListener("gesturechange", handleGesture);
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("gesturestart", handleGesture);
      window.removeEventListener("gesturechange", handleGesture);
    };
  }, []);
}
