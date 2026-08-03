import { useEffect } from "react";

import { useGameStore } from "~/stores/useGameStore";
import { AMBIENCE_GAIN, AMBIENCE_SRC, ambienceGain } from "~/game/audio/ambience";

// Module-singleton looping crowd murmur — same engine shape as useMusic (one
// element can ever exist, so StrictMode/HMR can't stack loops). Loudness =
// slider × bustle(population) × zoom closeness; the render loop reports the
// camera radius via setAmbienceRadius each frame.
// ponytail: direct volume sets, no ramp — population steps are tiny and zoom
// is per-frame continuous; shared AudioContext gain node if stepping is ever
// audible. Volume 0 keeps looping silently rather than pause/resume bookkeeping.
let audio: HTMLAudioElement | null = null;
let lastRadius = 40; // mid-zoom until the render loop reports

const applyVolume = () => {
  if (!audio) return;
  const s = useGameStore.getState();
  audio.volume = Math.min(
    1,
    s.ambienceVolume * AMBIENCE_GAIN * ambienceGain(s.population, lastRadius)
  );
};

// Called from the render loop every frame; no-op unless the zoom moved.
export function setAmbienceRadius(radius: number) {
  if (radius === lastRadius) return;
  lastRadius = radius;
  applyVolume();
}

const tryPlay = () => {
  if (!audio || !audio.paused) return;
  const el = audio;
  el.play().catch(() => {
    // Blocked (no gesture yet, e.g. ?demo skips the menu): retry on the next
    // interaction — only if this element is still the live one.
    if (el === audio) window.addEventListener("pointerdown", tryPlay, { once: true });
  });
};

// Idempotent — called from the menu click (gesture stack) and the hook mount.
export function startAmbience() {
  if (audio) return;
  audio = new Audio(AMBIENCE_SRC);
  // Dev-only hook for headless checks, like BabylonCanvas's __scene/__store.
  if (import.meta.env.DEV) (window as unknown as { __ambience: unknown }).__ambience = audio;
  audio.loop = true;
  applyVolume();
  tryPlay();
}

function stopAmbience() {
  window.removeEventListener("pointerdown", tryPlay);
  if (audio) {
    audio.pause();
    audio = null;
  }
}

export function useAmbience() {
  useEffect(() => {
    startAmbience(); // no-op after the menu click; the real start for ?demo
    const unsub = useGameStore.subscribe(applyVolume);
    return () => {
      unsub();
      stopAmbience();
    };
  }, []);
}
