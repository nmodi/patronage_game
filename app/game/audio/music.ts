// Sporadic era-based soundtrack: single tracks separated by minutes of
// silence, era chosen from prestige at schedule time (see the design doc's
// Music section). Cosmetic — plain Math.random, never the sim rng.

export const ERA_PRESTIGE = [0, 200, 450]; // era index → min prestige; Late lands just before Renaissance (500)

export type MusicTrack = { src: string; era: number; title: string };

// Jon Sayles' Italy-section recordings, era grouped by composer birth year:
// <1500 + anonymous = Early, 1500s = Mid,
// 1600s+ = Late. Cut a track by deleting its row — nowPlaying in Settings
// shows which one is on.
const js = (file: string, era: number, title: string): MusicTrack => ({
  src: `/music/jsayles/${file}`, era, title: `${title} — perf. Jon Sayles`,
});

export const TRACKS: MusicTrack[] = [
  { src: "/music/Suonatore_di_Liuto_Kevin_MacLeod_EarlyGame.mp3", era: 0, title: "Suonatore di Liuto — Kevin MacLeod" },
  js("0000_Ricercar_2_JSayles.m4a", 0, "Ricercar 2 — Gioseffo Guani"),
  js("0000_Saltarello_JSayles.m4a", 0, "Saltarello — Anonymous, 14th c."),
  js("1445_Crions_Nouel_JSayles.m4a", 0, "Crions Nouel — Alexander Agricola"),
  js("1450_El_Grillo_JSayles.m4a", 0, "El Grillo — Josquin Des Pres"),
  js("1497_Fantasia_58_JSayles.m4a", 0, "Fantasia 58 — Francesco Milano"),
  js("1510_La_Disperata_JSayles.m4a", 1, "La Disperata — Vincenzo Ruffo"),
  js("1525_Adoramus_JSayles.m4a", 1, "Adoramus — Palestrina"),
  js("1525_Ricercari_JSayles.m4a", 1, "Ricercari — Palestrina"),
  js("1525_Super_flumina_Babylonis_JSayles.m4a", 1, "Super flumina Babylonis — Palestrina"),
  js("1525_Vespers_JSayles.m4a", 1, "Vespers — Palestrina"),
  js("1553_Vezzosi_augelli_JSayles.m4a", 1, "Vezzosi augelli — Luca Marenzio"),
  js("1567_O_Rosetta_JSayles.m4a", 1, "O' Rosetta — Claudio Monteverdi"),
  js("1657_Cantate_Domino_JSayles.m4a", 2, "Cantate Domino — Giuseppe Pitoni"),
  js("1660_Sonata_in_A_JSayles.m4a", 2, "Sonata in A — Alessandro Scarlatti"),
  js("1660_Sonata_in_C_Major_JSayles.m4a", 2, "Sonata in C Major — Alessandro Scarlatti"),
  js("1660_Sonata_in_E_Minor_JSayles.m4a", 2, "Sonata in E Minor — Alessandro Scarlatti"),
  js("1678_Largo_JSayles.m4a", 2, "Largo — Antonio Vivaldi"),
  js("1678_Largo_from_D_Major_Lute_Concerto_JSayles.m4a", 2, "Largo, D Major Lute Concerto — Antonio Vivaldi"),
  js("1678_Largo_from_concerto_for_two_cellos_tomo_61_JSayles.m4a", 2, "Largo, Concerto for Two Cellos — Antonio Vivaldi"),
];

export const trackTitle = (src: string | null) =>
  TRACKS.find((t) => t.src === src)?.title ?? null;

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
  // Fall back to the nearest lower era with tracks, so cutting a whole era's
  // rows can never leave the game silent.
  let pool: MusicTrack[] = [];
  for (; era >= 0 && pool.length === 0; era--) {
    pool = TRACKS.filter((t) => t.era === era);
  }
  const candidates = pool.length > 1 ? pool.filter((t) => t.src !== lastSrc) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)].src;
}
