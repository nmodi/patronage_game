import { useMemo } from "react";
import { createPortal } from "react-dom";
import { Crown } from "lucide-react";

import { renaissanceProgress } from "~/game/renaissance";
import { formatMonth, useGameStore } from "~/stores/useGameStore";
import { Panel } from "./Panel";

/**
 * The Renaissance milestone card (Phase 12) — shown once when all four gates
 * hold (renaissance.ts), dismissed into the persisted renaissanceReached flag.
 * Derived from store state so crossings outside the tick (cathedral
 * prestigeOnBuild, displaying a wonder) trigger it too. No backdrop-click
 * dismiss: a once-per-game moment gets a deliberate click.
 */
export function RenaissanceCard() {
  const reached = useGameStore((s) => s.renaissanceReached);
  const dismiss = useGameStore((s) => s.dismissRenaissance);
  const prestige = useGameStore((s) => s.prestige);
  const artists = useGameStore((s) => s.artists);
  const artworks = useGameStore((s) => s.artworks);
  const cityName = useGameStore((s) => s.cityName);
  const tickCount = useGameStore((s) => s.time.tickCount);

  const progress = useMemo(
    () => renaissanceProgress(prestige, artists, artworks),
    [prestige, artists, artworks]
  );
  if (reached || !progress.all) return null;

  return createPortal(
    <div
      data-hud="true"
      className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
    >
      <Panel className="w-[26rem] text-center">
        <Crown className="mx-auto h-8 w-8 text-prestige-gold" strokeWidth={1.75} />
        <div className="mt-2 font-display text-2xl font-semibold text-ink">
          The Renaissance has come to {cityName}.
        </div>
        <div className="mt-1 text-sm text-ink-faint">{formatMonth(tickCount)}</div>
        <div className="mt-3 text-sm text-ink-faint">
          Masters work in its shops, the Church and the great houses vie for its artists, and
          travelers cross the mountains to stand before “{progress.wonder!.name}.”
        </div>
        <button
          className="mt-4 rounded-md border border-sienna bg-white/80 px-4 py-2 text-sm font-semibold text-sienna transition hover:bg-white"
          onClick={dismiss}
        >
          Enter the Golden Age
        </button>
      </Panel>
    </div>,
    document.body
  );
}
