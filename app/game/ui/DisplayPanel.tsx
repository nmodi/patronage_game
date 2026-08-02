import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";

import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { canDisplayWork, CHURCH_HOST_IDS } from "~/game/art/display";
import type { Artwork, DisplaySlotKind } from "~/game/types";
import { formatMonth, useGameStore } from "~/stores/useGameStore";
import { ArtworkRow } from "./ArtworkThumbnail";
import { Panel } from "./Panel";

const SLOT_LABEL: Record<DisplaySlotKind, string> = {
  painting: "painting",
  statue: "statue",
  plinth: "statue",
};

/**
 * Work-display panel for a building clicked in the 3D city (driven by the
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
  const [manage, setManage] = useState(false);

  const key = target?.key;
  useEffect(() => {
    setPickerSlot(null);
    setManage(false);
  }, [key]);

  if (!target || !tile) return null;
  const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
  if (!metadata?.displaySlots) return null;
  const slots = metadata.displaySlots;
  const isChurch = CHURCH_HOST_IDS.has(tile.buildingId);

  const bySlot = new Map<number, Artwork>();
  for (const w of artworks) {
    if (w.displayedAt?.key === target.key) bySlot.set(w.displayedAt.slot, w);
  }

  // A direct click on a filled plinth cell opens that work's detail view.
  const detailWork = target.slot != null ? bySlot.get(target.slot) : undefined;
  const outputBonus = Math.min(bySlot.size * 5, 25);

  const header = (
    <div className="flex items-center justify-between">
      <span>{manage || detailWork ? `${metadata.name} — Works` : metadata.name}</span>
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
            <ArtworkRow work={detailWork} artists={artists} />
            <span className="text-[10px] text-ink-faint">
              Completed {formatMonth(detailWork.completedTick)}
            </span>
            <button
              className="btn-secondary px-2 py-1.5 text-sm"
              onClick={() => {
                recallArtwork(detailWork.id);
                setInspectTarget({ key: target.key }); // fall back to the building card
              }}
            >
              Return to storage
            </button>
          </>
        ) : !manage ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-ink-faint">
              {bySlot.size} of {slots.length} works displayed
              {bySlot.size > 0 ? ` · +${outputBonus}% output` : ""}
            </span>
            <button
              className="rounded-full p-1.5 text-sienna transition hover:bg-parchment-deep"
              onClick={() => setManage(true)}
              aria-label="Manage works"
              title="Manage works"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
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
                    <ArtworkRow work={filled} artists={artists} />
                    <button
                      className="btn-secondary px-2 py-1 text-sm"
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
                              className="btn-primary px-2 py-1 text-left text-sm"
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
                        className="btn-quiet px-2 py-1 text-sm"
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
