import { useMemo } from "react";
import { Check } from "lucide-react";
import { Crown, Home, Store, Users } from "./gameIcons";

import { useGameStore } from "~/stores/useGameStore";
import { RENAISSANCE_NOBLE_HOUSES, RENAISSANCE_PRESTIGE } from "~/game/constants";
import { computeDisplaySummary } from "~/game/art/display";
import { renaissanceProgress } from "~/game/art/renaissance";
import { computeCityMetrics } from "~/game/city/metrics";
import { Panel, Row } from "./Panel";
import { ResourceStat } from "./ResourceStat";

// The top bar's population chip + its housing/amenities hover tooltip.
export function PopulationStat() {
  const population = useGameStore((s) => s.population);
  const tiles = useGameStore((s) => s.map.tiles);
  const artworks = useGameStore((s) => s.artworks);
  const { housing, amenities } = useMemo(
    () =>
      computeCityMetrics(tiles, undefined, computeDisplaySummary(tiles, artworks).counts, population),
    [tiles, artworks, population]
  );

  // The lower of the two caps is what growth is heading toward.
  const limiter =
    housing === amenities ? null : amenities < housing ? "amenities" : "housing";

  return (
    <ResourceStat
      icon={Users}
      label="Population"
      value={population}
      iconClassName="text-ink-faint"
      tooltip={
        <Panel className="w-56 text-sm">
          <div className="flex flex-col gap-1.5 normal-case">
            <Row label="Housing capacity" value={housing} />
            <Row label="Amenity capacity" value={amenities} />
          </div>
          {limiter && (
            <div className="mt-2.5 flex items-center gap-2 border-t border-wood/50 pt-2.5 text-xs italic text-ink-faint">
              {limiter === "amenities" ? (
                <Store className="h-4 w-4 shrink-0 text-ink-faint" />
              ) : (
                <Home className="h-4 w-4 shrink-0 text-ink-faint" />
              )}
              {limiter === "amenities" ? "Amenities are" : "Housing is"} limiting growth.
            </div>
          )}
        </Panel>
      }
    />
  );
}

// Prestige chip + the Renaissance milestone checklist on hover (Phase 12) —
// the multi-gate goal stays visible instead of being a hidden wall.
export function PrestigeStat() {
  const prestige = useGameStore((s) => s.prestige);
  const artworks = useGameStore((s) => s.artworks);
  const artists = useGameStore((s) => s.artists);
  const reached = useGameStore((s) => s.renaissanceReached);
  const progress = useMemo(
    () => renaissanceProgress(prestige, artists, artworks),
    [prestige, artists, artworks]
  );

  return (
    <ResourceStat
      icon={Crown}
      label="Prestige"
      value={Math.floor(prestige)}
      tooltip={
        <Panel className="w-64 text-sm">
          <div className="font-display font-semibold text-ink">
            {reached ? "The Golden Age" : "The Renaissance"}
          </div>
          <div className="mt-1.5 flex flex-col gap-1.5 normal-case">
            <CheckRow
              label="Prestige"
              met={progress.prestige}
              detail={`${Math.floor(prestige)} / ${RENAISSANCE_PRESTIGE}`}
            />
            <CheckRow label="A Master among your artists" met={progress.master} />
            <CheckRow
              label="A Wonder on display"
              met={progress.wonder != null}
              detail={progress.wonder ? `“${progress.wonder.name}”` : undefined}
            />
            <CheckRow label="A work for the Church" met={progress.church} />
            <CheckRow
              label="Works for noble houses"
              met={progress.nobleHouses >= RENAISSANCE_NOBLE_HOUSES}
              detail={`${Math.min(progress.nobleHouses, RENAISSANCE_NOBLE_HOUSES)} / ${RENAISSANCE_NOBLE_HOUSES}`}
            />
          </div>
          {reached && (
            <div className="mt-2.5 border-t border-wood/50 pt-2.5 text-xs italic text-ink-faint">
              The city lives its Golden Age.
            </div>
          )}
        </Panel>
      }
    />
  );
}

function CheckRow({ label, met, detail }: { label: string; met: boolean; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-ink-faint">{label}</span>
      <span
        className={`flex min-w-0 items-baseline gap-1 font-semibold ${met ? "text-ink" : "text-ink-faint"}`}
      >
        {detail && <span className="truncate">{detail}</span>}
        {met && <Check className="h-3.5 w-3.5 shrink-0 self-center text-verde" />}
      </span>
    </div>
  );
}
