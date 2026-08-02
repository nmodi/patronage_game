import { useEffect } from "react";

import { useGameStore } from "~/stores/useGameStore";
import { TRACK_GAP, pickTrack, randomDelay, trackTitle } from "~/game/music";

// Module-singleton playback engine — one element can ever exist, so a stale
// React effect (StrictMode double-mount, HMR) can't leave a second track
// playing. The menu click calls startMusic() inside its own gesture call
// stack, which satisfies the strictest autoplay rule (Safari); Chrome's
// sticky activation is covered by the same click. ?demo skips the menu, so
// there the hook-mount startMusic() gets blocked and the one-shot pointerdown
// retry starts music on the first interaction instead. This is also the seam
// the ambience/SFX slice will grow from (shared AudioContext resume here).
let audio: HTMLAudioElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSrc: string | null = null;

const playNext = () => {
  // Never interrupt a playing track — makes retries/double calls harmless.
  if (!audio || !audio.paused) return;
  // Volume 0 = off: stay silent and check again next window.
  if (useGameStore.getState().musicVolume === 0) return schedule();
  lastSrc = pickTrack(useGameStore.getState().prestige, lastSrc);
  audio.src = lastSrc;
  useGameStore.getState().setNowPlaying(trackTitle(lastSrc));
  const el = audio;
  el.play().catch(() => {
    // Blocked (no gesture yet) or aborted: retry on the next interaction —
    // only if this element is still the live one (not a torn-down zombie).
    if (el === audio) window.addEventListener("pointerdown", playNext, { once: true });
  });
};

const schedule = () => {
  useGameStore.getState().setNowPlaying(null);
  clearTimeout(timer);
  timer = setTimeout(playNext, randomDelay(TRACK_GAP));
};

// Settings-panel skip: end the current track (or the silence gap) and play
// another immediately — for auditioning which tracks fit.
export function skipTrack() {
  if (!audio) return;
  audio.pause();
  clearTimeout(timer);
  playNext();
}

// Idempotent — called from the menu click (gesture stack) and the hook mount.
export function startMusic() {
  if (audio) return;
  audio = new Audio();
  audio.volume = useGameStore.getState().musicVolume;
  audio.onended = schedule;
  playNext();
}

function stopMusic() {
  window.removeEventListener("pointerdown", playNext);
  clearTimeout(timer);
  if (audio) {
    audio.onended = null;
    audio.pause();
    audio = null;
    useGameStore.getState().setNowPlaying(null);
  }
}

export function useMusic() {
  useEffect(() => {
    startMusic(); // no-op after the menu click; the real start for ?demo
    const unsub = useGameStore.subscribe((s) => {
      if (audio) audio.volume = s.musicVolume;
    });
    return () => {
      unsub();
      stopMusic();
    };
  }, []);
}
