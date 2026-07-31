// Sporadic era-based soundtrack: single tracks separated by minutes of
// silence, era chosen from prestige at schedule time (see the design doc's
// Music section). Cosmetic — plain Math.random, never the sim rng.

export const ERA_PRESTIGE = [0, 200, 450]; // era index → min prestige; Late lands just before Renaissance (500)

export type MusicTrack = { src: string; era: number };

export const TRACKS: MusicTrack[] = [
  { src: "/music/saltarello_J_Sayles_EarlyGame.mp3", era: 0 },
  { src: "/music/Suonatore_di_Liuto_Kevin_MacLeod_EarlyGame.mp3", era: 0 },
];

// Silence window between tracks, in ms. The first track plays immediately on
// city load (useMusic) — a session never starts silent.
export const TRACK_GAP: [number, number] = [90_000, 240_000];

export const randomDelay = ([min, max]: [number, number]) =>
  min + Math.random() * (max - min);

export function pickTrack(prestige: number, lastSrc: string | null): string {
  let era = 0;
  for (let i = 0; i < ERA_PRESTIGE.length; i++) {
    if (prestige >= ERA_PRESTIGE[i]) era = i;
  }
  // Fall back to the nearest lower era with tracks — Mid/Late are unpopulated
  // today, so every era plays Early until tracks are appended to TRACKS.
  let pool: MusicTrack[] = [];
  for (; era >= 0 && pool.length === 0; era--) {
    pool = TRACKS.filter((t) => t.era === era);
  }
  const candidates = pool.length > 1 ? pool.filter((t) => t.src !== lastSrc) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)].src;
}
