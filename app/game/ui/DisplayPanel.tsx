import { useEffect, useState } from "react";
import { Crown, X } from "lucide-react";

import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { RANK_LABEL } from "~/game/artists";
import { artworkQuality, canDisplayWork, CHURCH_HOST_IDS } from "~/game/display";
import type { Artwork, DisplaySlotKind } from "~/game/types";
import { formatMonth, useGameStore } from "~/stores/useGameStore";
import { ArtworkThumbnail } from "./ArtworkThumbnail";
import { Panel } from "./Panel";
import { capitalizeLabel } from "./format";

const SLOT_LABEL: Record<DisplaySlotKind, string> = {
  painting: "painting",
  statue: "statue",
  plinth: "statue",
};

/**
 * Masterwork-display panel for a building clicked in the 3D city (driven by the
 * store's inspectTarget, like RazeConfirm). Shows its slots — fill an empty one
 * from storage, recall a filled one — or, on a direct click of a filled plinth,
 * that work's detail. The shared canDisplayWork guard drives the pickers.
 */
export function DisplayPanel() {
  const target = useGameStore((s) => s.inspectTarget);
  const tile = useGameStore((s) => (s.inspectTarget ? s.map.tiles[s.inspectTarget.key] : undefined));
  const tiles = useGameStore((s) => s.map.tiles);
  const artworks = useGameStore((s) => s.artworks);
  const artists = useGameStore((s) => s.artists);
  const displayArtwork = useGameStore((s) => s.displayArtwork);
  const recallArtwork = useGameStore((s) => s.recallArtwork);
  const setInspectTarget = useGameStore((s) => s.setInspectTarget);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  const key = target?.key;
  useEffect(() => setPickerSlot(null), [key]);

  if (!target || !tile) return null;
  const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
  if (!metadata?.displaySlots) return null;
  const slots = metadata.displaySlots;
  const isChurch = CHURCH_HOST_IDS.has(tile.buildingId);

  const bySlot = new Map<number, Artwork>();
  for (const w of artworks) {
    if (w.displayedAt?.key === target.key) bySlot.set(w.displayedAt.slot, w);
  }

  const workRow = (w: Artwork) => {
    const artist = artists.find((a) => a.id === w.artistId);
    return (
      <>
        <ArtworkThumbnail title={w.name} variant="gallery" />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="font-display text-sm font-semibold text-ink">{w.name}</span>
          <span className="text-xs text-ink-faint">
            {artist
              ? `${artist.name}, ${RANK_LABEL[artist.rank]} ${capitalizeLabel(w.artistType)}`
              : capitalizeLabel(w.artistType)}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-ink-faint">
            <Crown className="h-3 w-3 text-prestige-gold" /> {artworkQuality(w)}
            {w.requester ? ` · For ${w.requester}` : ""}
          </span>
        </div>
      </>
    );
  };

  // A direct click on a filled plinth cell opens that work's detail view.
  const detailWork = target.slot != null ? bySlot.get(target.slot) : undefined;

  const header = (
    <div className="flex items-center justify-between">
      <span>{metadata.name} — Masterworks</span>
      <button
        className="rounded-full p-1 text-ink-faint transition hover:bg-parchment-deep"
        onClick={() => setInspectTarget(null)}
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="fixed left-1/2 top-16 z-50 w-80 -translate-x-1/2">
      <Panel header={header} className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        {detailWork ? (
          <>
            <div className="flex items-start gap-3">{workRow(detailWork)}</div>
            <span className="text-[10px] text-ink-faint">
              Completed {formatMonth(detailWork.completedTick)}
            </span>
            <button
              className="rounded bg-parchment-deep px-2 py-1.5 text-sm font-semibold text-ink transition hover:bg-wood/40"
              onClick={() => {
                recallArtwork(detailWork.id);
                setInspectTarget({ key: target.key }); // fall back to the slot list
              }}
            >
              Return to storage
            </button>
          </>
        ) : (
          slots.map((slot, i) => {
            const filled = bySlot.get(i);
            const eligible =
              pickerSlot === i
                ? artworks.filter((w) => canDisplayWork(w, target.key, i, tiles, artworks))
                : [];
            return (
              <div
                key={i}
                className="flex flex-col gap-1.5 border-b border-wood/40 pb-2 last:border-0 last:pb-0"
              >
                {filled ? (
                  <>
                    <div className="flex items-start gap-3">{workRow(filled)}</div>
                    <button
                      className="rounded bg-parchment-deep px-2 py-1 text-sm font-semibold text-ink transition hover:bg-wood/40"
                      onClick={() => recallArtwork(filled.id)}
                    >
                      Return to storage
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-ink-faint">Empty {SLOT_LABEL[slot.kind]} slot</span>
                    {pickerSlot === i ? (
                      <div className="flex flex-col gap-1">
                        {eligible.length === 0 ? (
                          <span className="text-xs italic text-ink-faint">
                            No compatible works in storage.
                          </span>
                        ) : (
                          eligible.map((w) => (
                            <button
                              key={w.id}
                              className="rounded bg-sienna px-2 py-1 text-left text-sm font-semibold text-parchment transition hover:bg-sienna/85"
                              onClick={() => {
                                displayArtwork(w.id, target.key, i);
                                setPickerSlot(null);
                              }}
                            >
                              {w.name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : (
                      <button
                        className="rounded border border-wood/50 bg-parchment-deep px-2 py-1 text-sm font-semibold text-sienna transition hover:bg-wood/30"
                        onClick={() => setPickerSlot(i)}
                      >
                        Place a work…
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
        <span className="text-xs italic text-ink-faint">
          Each displayed work: +5% building output · trickles {isChurch ? "Prestige" : "Inspiration"}
        </span>
      </Panel>
    </div>
  );
}
