// Ambient crowd-murmur loop: gain math only — the HTMLAudio engine lives in
// ui/useAmbience.ts, mirroring the music.ts / useMusic.ts data/engine split.
import { bustle } from "../city/traffic.ts";

export const AMBIENCE_SRC = "/sfx/ambience-crowd.m4a";

// Overall trim so the murmur sits under the music and one-shot SFX.
export const AMBIENCE_GAIN = 1;

// Camera radius range (sceneSetup's lower/upperRadiusLimit) mapped to a
// closeness factor: fully zoomed in = 1, fully out = ZOOM_QUIET — a floor,
// not silence, so the city doesn't die the moment you pull back.
export const ZOOM_NEAR = 3;
export const ZOOM_FAR = 80;
export const ZOOM_QUIET = 0.3;

/** 0..1 loudness for the crowd loop: citywide bustle × camera closeness. */
export function ambienceGain(population: number, radius: number): number {
  const t = Math.min(1, Math.max(0, (ZOOM_FAR - radius) / (ZOOM_FAR - ZOOM_NEAR)));
  return bustle(population) * (ZOOM_QUIET + (1 - ZOOM_QUIET) * t);
}
