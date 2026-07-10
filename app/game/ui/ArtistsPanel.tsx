import { Hammer, Palette, Sparkles, type LucideIcon } from "lucide-react";

import { useGameStore } from "~/stores/useGameStore";
import { RANK_LABEL } from "~/game/artists";
import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { blockedReason, getSupply, MATERIAL_BY_ARTIST_TYPE } from "~/game/materials";
import { HudPanel } from "./Panel";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ARTIST_ICONS: Record<string, LucideIcon> = {
  painter: Palette,
  sculptor: Hammer,
};

function ArtistThumb({ type }: { type?: string }) {
  const Icon = (type && ARTIST_ICONS[type]) || Sparkles;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-wood/50 bg-parchment-deep">
      <Icon className="h-5 w-5 text-ink-faint" strokeWidth={1.75} />
    </div>
  );
}

export function ArtistsPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const artists = useGameStore((s) => s.artists);
  const tiles = useGameStore((s) => s.map.tiles);
  const commissions = useGameStore((s) => s.commissions);

  const workshops = Object.values(tiles)
    .filter((t) => t.isOrigin && BUILDING_METADATA_BY_ID[t.buildingId]?.artistCapacity != null)
    .map((t) => `${t.position.x},${t.position.y}`)
    .sort();
  const supply = getSupply(tiles, artists);

  if (workshops.length === 0) return null;

  return (
    <HudPanel
      icon={Sparkles}
      open={open}
      onToggle={onToggle}
      label="Artists & Workshops"
      header={
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-sienna" />
          Artists &amp; Workshops ({workshops.length})
        </span>
      }
      className="flex max-h-[60vh] flex-col gap-2.5 overflow-y-auto"
    >
        {workshops.map((key) => {
          const members = artists.filter((a) => a.homeTileKey === key);
          const founder = members[0];
          const active = tiles[key]?.isActive ?? false;
          if (!founder) {
            // Pre-rework save: workshop without a crew; first arrival founds it.
            return (
              <div key={key} className="flex items-center gap-2.5">
                <ArtistThumb />
                <div className="flex flex-col leading-tight">
                  <span className="font-display text-base font-semibold text-ink">Workshop</span>
                  <span className="text-xs text-ink-faint">Vacant</span>
                </div>
              </div>
            );
          }
          const commission = commissions.find((c) => c.workshopKey === key);
          const working = founder.workProgress != null && commission != null;
          const founderSupply = supply[founder.type];
          const materialBlocked = working && founderSupply != null && !founderSupply.allowed.has(key);
          const atCapacity = founderSupply != null && founderSupply.inUse >= founderSupply.capacity;
          return (
            <div key={key} className="flex items-start gap-2.5">
              <ArtistThumb type={founder.type} />
              <div className="flex flex-col leading-tight">
                <span className="font-display text-base font-semibold text-ink">
                  Bottega di {founder.name}
                </span>
                <span className="text-sm text-ink-faint">
                  {RANK_LABEL[founder.rank]} {capitalize(founder.type)} · {members.length}{" "}
                  {members.length === 1 ? "artist" : "artists"}
                </span>
                {working ? (
                  <span className={`text-xs ${active ? "text-prestige-gold" : "text-sienna"}`}>
                    At work on {commission!.title} — {Math.floor(founder.workProgress!)}/
                    {commission!.durationMonths} months
                    {materialBlocked
                      ? ` (no ${MATERIAL_BY_ARTIST_TYPE[founder.type]})`
                      : !active && " (paused)"}
                  </span>
                ) : !active ? (
                  <span className="text-xs text-sienna">Workshop unstaffed</span>
                ) : atCapacity ? (
                  <span className="text-xs text-sienna">
                    {blockedReason(founder.type, founderSupply)}
                  </span>
                ) : (
                  <span className="text-xs text-ink-faint">Awaiting a commission</span>
                )}
              </div>
            </div>
          );
        })}
    </HudPanel>
  );
}
