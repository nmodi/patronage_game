import { useState, type ReactNode } from "react";
import {
  type LucideIcon,
  ArrowLeft,
  Check,
  Copy,
  Home,
  Music,
  RotateCcw,
  ScrollText,
  SkipForward,
  Users,
  Volume2,
} from "lucide-react";

import { useGameStore } from "~/stores/useGameStore";
import { ARCHETYPE_LABELS, getWater } from "~/game/map/water";
import { CloseButton, Panel } from "./Panel";
import { skipTrack } from "./useMusic";

/**
 * The settings dropdown under the top bar's gear button, including the
 * credits sub-panel. Mounted only while open, so its nav/confirm state
 * resets on close for free.
 */
export function SettingsMenu({ onClose }: { onClose: () => void }) {
  const resetGame = useGameStore((s) => s.resetGame);
  const seed = useGameStore((s) => s.seed);
  const mapSeed = useGameStore((s) => s.mapSeed);
  const musicVolume = useGameStore((s) => s.musicVolume);
  const setMusicVolume = useGameStore((s) => s.setMusicVolume);
  const sfxVolume = useGameStore((s) => s.sfxVolume);
  const setSfxVolume = useGameStore((s) => s.setSfxVolume);
  const ambienceVolume = useGameStore((s) => s.ambienceVolume);
  const setAmbienceVolume = useGameStore((s) => s.setAmbienceVolume);
  const nowPlaying = useGameStore((s) => s.nowPlaying);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);

  const copySeed = () => {
    // ponytail: seeds are stored lowercase; shown/copied uppercase for readability.
    // Harmless now (no seed-input UI) — a future "load seed" must lowercase on input.
    navigator.clipboard?.writeText(seed.toUpperCase());
    setSeedCopied(true);
    setTimeout(() => setSeedCopied(false), 1200);
  };

  if (creditsOpen) {
    return (
      <div className="absolute right-0 top-full">
        <Panel
          frameClassName="theme-navy rounded-bl-lg border-t-0 border-r-0"
          header={
            <div className="flex items-center gap-2">
              <CloseButton
                icon={ArrowLeft}
                label="Back to settings"
                onClick={() => setCreditsOpen(false)}
              />
              Credits
            </div>
          }
          className="flex w-72 flex-col gap-2.5 text-sm"
        >
          <CreditsBody />
        </Panel>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-full">
      <Panel frameClassName="theme-navy rounded-bl-lg border-t-0 border-r-0" header="Settings" className="flex w-72 flex-col gap-2 text-sm">
        <SectionLabel>Audio</SectionLabel>
        {/* Sliders double as mute: 0 = off. Ambience loudness also rides population + camera zoom. */}
        <VolumeRow icon={Music} label="Music" value={musicVolume} onChange={setMusicVolume} />
        <VolumeRow icon={Users} label="Ambience" value={ambienceVolume} onChange={setAmbienceVolume} />
        <VolumeRow icon={Volume2} label="Sound Effects" value={sfxVolume} onChange={setSfxVolume} />
        {/* Now-playing + skip: for auditioning which tracks fit the game. */}
        <SectionLabel>Now Playing</SectionLabel>
        <div className="flex items-center gap-1.5 rounded-md border border-wood/50 bg-parchment-deep px-3 py-2 leading-snug text-ink">
          {/* Title only — composer/performer live in TRACKS for the credits pass. */}
          <span className={`min-w-0 flex-1 ${nowPlaying ? "" : "italic text-ink-faint"}`}>
            {nowPlaying ? nowPlaying.split(" — ")[0] : "Nothing playing"}
          </span>
          {/* skipTrack also ends the silence gap early, so this doubles as "play now". */}
          <button
            className="shrink-0 rounded-full p-1 text-ink-faint transition hover:bg-wood/40 hover:text-ink"
            onClick={skipTrack}
            aria-label={nowPlaying ? "Skip track" : "Play next track"}
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>
        <SectionLabel>Game</SectionLabel>
        {/* Two-click confirm in place — no native dialog breaking the parchment world. */}
        <button
          className="btn-secondary flex items-center gap-2 px-3 py-2"
          onClick={() => {
            if (!confirmRestart) {
              setConfirmRestart(true);
              return;
            }
            resetGame();
            onClose();
          }}
        >
          <RotateCcw className="h-4 w-4" />
          {confirmRestart ? "Erase all progress?" : "Restart Game"}
        </button>
        <button
          className="btn-secondary flex items-center gap-2 px-3 py-2"
          // ponytail: full reload = the one clean path back to the menu — drops
          // transient UI state and exits ?demo mode uniformly; the save is
          // already persisted (every set writes through).
          onClick={() => window.location.assign("/")}
        >
          <Home className="h-4 w-4" />
          Main Menu
        </button>
        <button
          className="btn-secondary mt-1 flex items-center gap-2 px-3 py-2"
          onClick={() => setCreditsOpen(true)}
        >
          <ScrollText className="h-4 w-4" />
          Credits
        </button>
        {/* Footer: map · seed (click copies) · version, one quiet line. */}
        <div className="flex items-center justify-center gap-1.5 border-t border-wood/50 pt-2 text-center text-xs tracking-wide text-ink-faint">
          {mapSeed != null && (
            <>
              <span>{ARCHETYPE_LABELS[getWater(mapSeed)!.archetype]}</span>
              <span>·</span>
            </>
          )}
          <button
            className="flex items-center gap-1.5 transition hover:text-ink"
            onClick={copySeed}
            title="Copy seed"
          >
            Seed {seed.toUpperCase()}
            {seedCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
          <span>·</span>
          {/* Stamped by vite.config.ts at build time — never hand-edited. */}
          <span>v{import.meta.env.VITE_BUILD_DATE}</span>
        </div>
      </Panel>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint first:mt-0">
      {children}
    </span>
  );
}

/** Shared with the main menu's Settings modal. */
export function VolumeRow({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 px-1 text-ink-faint">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="w-24 shrink-0 text-ink">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vol-slider w-full"
        style={{
          background: `linear-gradient(to right, var(--color-sienna) ${value * 100}%, color-mix(in srgb, var(--color-wood) 50%, transparent) ${value * 100}%)`,
        }}
        aria-label={`${label} volume`}
      />
    </label>
  );
}

// All assets are CC0/open — shared as courtesy now, and the list is ready
// the day something non-CC0 lands. Rendered in the in-game settings panel and
// the main menu's Credits modal; full attributions live in CREDITS.md.
export function CreditsBody() {
  return (
    <>
      <CreditRow
        what="3D models"
        who="Kenney — Fantasy Town Kit & Nature Kit"
        license="CC0"
        href="https://kenney.nl"
      />
      <CreditRow
        what="Sound effects"
        who="Kenney — Impact, RPG Audio & Jingles packs"
        license="CC0"
        href="https://kenney.nl"
      />
      <CreditRow
        what="Crowd ambience"
        who="Medieval market — Metzik, freesound.org"
        license="CC BY 4.0"
        href="https://freesound.org/people/Metzik/sounds/371222/"
      />
      <CreditRow
        what="Menu artwork"
        who="Andrea Palladio plate engravings — Wikimedia Commons"
        license="public domain"
        href="https://commons.wikimedia.org/wiki/Category:I_quattro_libri_dell%27architettura"
      />
      <div className="flex flex-col gap-1 leading-snug">
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">Music</span>
        <a
          href="https://www.jsayles.com/familypages/EarlyMusic.htm"
          target="_blank"
          rel="noreferrer"
          className="text-ink transition hover:text-sienna"
        >
          Early music recordings{" "}
          <span className="text-xs text-ink-faint">perf. Jon Sayles</span>
        </a>
        <a
          href="https://incompetech.com"
          target="_blank"
          rel="noreferrer"
          className="text-ink transition hover:text-sienna"
        >
          Suonatore di Liuto — Kevin MacLeod{" "}
          <span className="text-xs text-ink-faint">(CC BY 4.0)</span>
        </a>
      </div>
    </>
  );
}

function CreditRow({
  what,
  who,
  license,
  href,
}: {
  what: string;
  who: string;
  license: string;
  href: string;
}) {
  return (
    <div className="flex flex-col leading-snug">
      <span className="text-[10px] uppercase tracking-wide text-ink-faint">{what}</span>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-ink transition hover:text-sienna"
      >
        {who} <span className="text-xs text-ink-faint">({license})</span>
      </a>
    </div>
  );
}
