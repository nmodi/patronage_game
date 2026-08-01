import { useGameStore } from "~/stores/useGameStore";

// One-shot interaction sounds (Kenney CC0 packs, converted to AAC — Safari
// can't decode Ogg Vorbis). Same lazy web-audio stance as useMusic.ts: plain
// HTMLAudioElements, no AudioContext. Each play clones a preloaded element so
// rapid sounds overlap instead of cutting each other off; a play() rejected by
// the autoplay policy (nothing clicked yet — e.g. the ?demo boot tick) is
// simply dropped. Store actions call playSfx for sim events; interactive-only
// sounds (place/raze thunks) live at the input call sites in placement.ts so
// programmatic placement (demo boot) stays silent.
// ponytail: HTMLAudio clones; upgrade to a shared AudioContext if latency or
// per-sound gain shaping ever matters.
// All organic foley, no synth UI bleeps — the digital Interface Sounds pack
// was tried for the UI half and read as sci-fi against the parchment world.
// Files are named kenney_<pack>_<source clip> so a clip can be re-pulled or
// swapped later; this map is the game-facing name.
export const SFX = {
  place: "/sfx/kenney_impact_sounds_impactPlank_medium_000.m4a", // building committed
  raze: "/sfx/kenney_impact_sounds_footstep_snow_004.m4a", // demolition
  deny: "/sfx/kenney_impact_sounds_impactSoft_heavy_000.m4a", // click on an invalid spot
  rotate: "/sfx/kenney_rpg_audio_drawKnife2.m4a", // R rotates the ghost
  select: "/sfx/kenney_rpg_audio_cloth4.m4a", // building picked in the palette
  toggle: "/sfx/kenney_rpg_audio_metalClick.m4a", // pause / speed pills
  open: "/sfx/kenney_rpg_audio_bookOpen.m4a", // panel opened
  close: "/sfx/kenney_rpg_audio_bookClose.m4a", // panel closed
  offer: "/sfx/kenney_rpg_audio_handleCoins2.m4a", // a paying patron's offer arrives
  denounce: "/sfx/kenney_impact_sounds_impactBell_heavy_001.m4a", // a patron denounces the city
  payout: "/sfx/kenney_rpg_audio_handleCoins.m4a", // a work completes and pays
  assign: "/sfx/kenney_rpg_audio_bookPlace1.m4a", // commission assigned
  decline: "/sfx/kenney_rpg_audio_bookFlip2.m4a", // offer declined
  display: "/sfx/kenney_impact_sounds_impactGlass_light_000.m4a", // artwork displayed or recalled
  fanfare: "/sfx/kenney_music_jingles_PIZZI07.m4a", // the Renaissance card
} as const;

export type SfxName = keyof typeof SFX;

// Per-sound trim, multiplied into sfxVolume — the source clips aren't
// loudness-matched, so tune outliers here instead of re-encoding files.
const GAIN: Partial<Record<SfxName, number>> = {
  close: 0.4, // bookClose lands as a slam at full volume
};

// Global trim under the user's sfxVolume — the whole set sat a touch loud.
const MASTER_GAIN = 0.8;

const cache = new Map<SfxName, HTMLAudioElement>();

export function playSfx(name: SfxName) {
  if (typeof Audio === "undefined") return; // SSR / node checks
  const volume = useGameStore.getState().sfxVolume;
  if (volume === 0) return;
  let base = cache.get(name);
  if (!base) {
    base = new Audio(SFX[name]);
    cache.set(name, base);
  }
  const el = base.cloneNode() as HTMLAudioElement;
  el.volume = Math.min(1, volume * MASTER_GAIN * (GAIN[name] ?? 1));
  el.play().catch(() => {});
}
