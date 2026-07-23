import { useState } from "react";
import { Church, Shield } from "lucide-react";

import { useGameStore } from "~/stores/useGameStore";
import { CHURCH, favorOf, favorRung, favorTier, requesterPool } from "~/game/commissions";
import { FAVOR_COOLED, FAVOR_RUNGS } from "~/game/constants";
import { Panel } from "./Panel";

const RUNG_LABELS = ["Neutral", "Favored", "Esteemed", "Exalted"];

const BANNER_COLORS: Record<string, string> = {
  [CHURCH]: "var(--color-verde)",
  "House Medici": "var(--color-sienna)",
  "House Strozzi": "var(--color-prestige-gold)",
  "House Pazzi": "var(--color-crest-blue)",
};

/**
 * One hanging pennant per admitted patron (Civ-style diplomacy banners),
 * top-right under the settings button; click toggles that patron's standing
 * card — the open banner unfurls lower.
 */
export function FactionBanner() {
  const tiles = useGameStore((s) => s.map.tiles);
  const favor = useGameStore((s) => s.favor);
  const [openName, setOpenName] = useState<string | null>(null);

  const pool = requesterPool(tiles);
  if (pool.length === 0) return null;
  const open = pool.find((r) => r.name === openName);

  return (
    <div className="pointer-events-none fixed right-6 top-16 z-40 flex flex-col items-end gap-2">
      <div className="flex items-start gap-2">
        {pool.map((r) => {
          const Icon = r.name === CHURCH ? Church : Shield;
          const isOpen = openName === r.name;
          return (
            <button
              key={r.name}
              data-hud="true"
              className={`group pointer-events-auto w-12 ${
                isOpen
                  ? "[filter:drop-shadow(0_0_3px_var(--color-prestige-gold))_drop-shadow(0_3px_4px_rgba(40,25,10,0.45))]"
                  : "[filter:drop-shadow(0_3px_4px_rgba(40,25,10,0.45))]"
              }`}
              onClick={() => setOpenName((n) => (n === r.name ? null : r.name))}
              aria-label={r.name}
              title={r.name}
            >
              <div className="h-1.5 rounded-full bg-wood" />
              <div
                className={`mx-0.5 -mt-0.5 flex justify-center pt-3 transition-all duration-200 [clip-path:polygon(0_0,100%_0,100%_82%,50%_100%,0_82%)] ${
                  isOpen ? "h-24" : "h-[4.25rem] group-hover:h-20"
                }`}
                style={{
                  backgroundColor: BANNER_COLORS[r.name] ?? "var(--color-crest-blue)",
                  backgroundImage:
                    "linear-gradient(90deg, rgba(0,0,0,0.28), rgba(0,0,0,0) 25%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.28)), linear-gradient(rgba(255,255,255,0.12), rgba(0,0,0,0.18))",
                }}
              >
                <Icon className="h-6 w-6 text-parchment drop-shadow" strokeWidth={1.75} />
              </div>
            </button>
          );
        })}
      </div>
      {open && <FactionCard name={open.name} value={favorOf(favor, open.name)} />}
    </div>
  );
}

function FactionCard({ name, value }: { name: string; value: number }) {
  const tiles = useGameStore((s) => s.map.tiles);
  const tier = favorTier(value);
  const rung = favorRung(name, value, tiles);
  // Cathedral cap: favor alone would earn a higher rung than the city grants.
  const uncappedRung = FAVOR_RUNGS.filter((t) => value >= t).length;
  const nextRung = FAVOR_RUNGS.find((t) => value < t);
  const standing =
    tier === "affronted" ? "Affronted" : tier === "cooled" ? "Cooled" : RUNG_LABELS[rung]!;

  return (
    <Panel header={name} className="flex w-60 flex-col gap-1.5 text-sm">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-ink-faint">Favor</span>
        <span className="font-semibold text-ink">{value}%</span>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-ink-faint">Standing</span>
        <span className="font-semibold text-ink">{standing}</span>
      </div>
      {tier === "neutral" && nextRung != null && (
        <span className="text-xs italic text-ink-faint">
          Grander commissions at {nextRung}% favor.
        </span>
      )}
      {tier === "neutral" && rung < uncappedRung && (
        <span className="text-xs italic text-ink-faint">
          The Church's grandest asks await a Cathedral.
        </span>
      )}
      {value < FAVOR_COOLED && (
        <span className="text-xs italic text-ink-faint">
          Relations have soured — completing a commission mends them.
        </span>
      )}
    </Panel>
  );
}
