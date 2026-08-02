import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Home,
  Music,
  RotateCcw,
  ScrollText,
  SkipForward,
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
      <div className="absolute right-4 top-full mt-2">
        <Panel
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
          {/* Full attributions with license terms live in CREDITS.md. */}
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
        </Panel>
      </div>
    );
  }

  return (
    <div className="absolute right-4 top-full mt-2">
      <Panel header="Settings" className="flex w-60 flex-col gap-2 text-sm">
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
        {/* Now-playing + skip: for auditioning which tracks fit the game. */}
        {nowPlaying && (
          <div className="flex items-center gap-1.5 px-1 text-base leading-snug text-ink-faint">
            {/* Title only — composer/performer live in TRACKS for the credits pass. */}
            <span className="min-w-0 flex-1">{nowPlaying.split(" — ")[0]}</span>
            <button
              className="shrink-0 rounded-full p-1 transition hover:bg-parchment-deep hover:text-ink"
              onClick={skipTrack}
              aria-label="Skip track"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {/* Slider doubles as mute: 0 = off. */}
        <label className="flex items-center gap-2 px-1 text-ink-faint">
          <Music className="h-4 w-4 shrink-0" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={musicVolume}
            onChange={(e) => setMusicVolume(Number(e.target.value))}
            className="w-full accent-sienna"
            aria-label="Music volume"
          />
        </label>
        <label className="flex items-center gap-2 px-1 text-ink-faint">
          <Volume2 className="h-4 w-4 shrink-0" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sfxVolume}
            onChange={(e) => setSfxVolume(Number(e.target.value))}
            className="w-full accent-sienna"
            aria-label="Sound effects volume"
          />
        </label>
        <button
          className="btn-secondary flex items-center gap-2 px-3 py-2"
          onClick={() => setCreditsOpen(true)}
        >
          <ScrollText className="h-4 w-4" />
          Credits
        </button>
        <button
          className="flex items-center justify-center gap-1.5 text-center text-xs tracking-wide text-ink-faint transition hover:text-ink"
          onClick={copySeed}
          title="Copy seed"
        >
          Seed: {seed.toUpperCase()}
          {seedCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
        {mapSeed != null && (
          <span className="text-center text-xs text-ink-faint">
            Map: {ARCHETYPE_LABELS[getWater(mapSeed)!.archetype]}
          </span>
        )}
        <span className="text-center text-xs text-ink-faint">v0.1</span>
      </Panel>
    </div>
  );
}

// All assets are CC0/open — shared as courtesy now, and the list is ready
// the day something non-CC0 lands.
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
