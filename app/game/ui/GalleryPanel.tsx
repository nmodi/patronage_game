import { useState } from "react";
import { Images } from "./gameIcons";

import { formatMonth, useGameStore } from "~/stores/useGameStore";
import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { canDisplayWork } from "~/game/art/display";
import { playSfx } from "~/game/audio/sfx";
import { CloseButton, HudToggleButton, ModalBackdrop, Panel } from "./Panel";
import { ArtworkRow } from "./ArtworkThumbnail";

// Circular HUD button (top-left row) + fullscreen codex modal.
export function GalleryPanel() {
  const [open, setOpenRaw] = useState(false);
  const setOpen = (next: boolean) => {
    playSfx(next ? "open" : "close");
    setOpenRaw(next);
  };
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const artworks = useGameStore((s) => s.artworks);
  const artists = useGameStore((s) => s.artists);
  const tiles = useGameStore((s) => s.map.tiles);
  const displayArtwork = useGameStore((s) => s.displayArtwork);
  const recallArtwork = useGameStore((s) => s.recallArtwork);

  return (
    <>
      <HudToggleButton icon={Images} label="Gallery" open={open} onClick={() => setOpen(true)} />
      {open && (
        <ModalBackdrop onDismiss={() => setOpen(false)}>
          <div className="w-[28rem]" onClick={(e) => e.stopPropagation()}>
            <Panel
              header={
                <div className="flex items-center justify-between">
                  <span>Gallery of Works ({artworks.length})</span>
                  <CloseButton label="Close gallery" onClick={() => setOpen(false)} />
                </div>
              }
              className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto"
            >
              {artworks.length === 0 ? (
                <span className="text-sm text-ink-faint">
                  No works completed yet — accept a commission to begin.
                </span>
              ) : (
                [...artworks].reverse().map((w) => {
                  const host = w.displayedAt ? tiles[w.displayedAt.key] : undefined;
                  const slotKind = w.artistType === "painter" ? "painting" : "statue";
                  // Hosts with a free compatible slot; auto-pick the first such slot.
                  const hosts =
                    expandedId === w.id
                      ? Object.values(tiles)
                          .filter(
                            (t) => t.isOrigin && BUILDING_METADATA_BY_ID[t.buildingId]?.displaySlots
                          )
                          .map((t) => {
                            const hostKey = `${t.origin.x},${t.origin.y}`;
                            const dslots = BUILDING_METADATA_BY_ID[t.buildingId]!.displaySlots!;
                            const slot = dslots.findIndex((_, i) =>
                              canDisplayWork(w, hostKey, i, tiles, artworks)
                            );
                            return { key: hostKey, name: BUILDING_METADATA_BY_ID[t.buildingId]!.name, slot };
                          })
                          .filter((h) => h.slot >= 0)
                          .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
                      : [];
                  return (
                    <div
                      key={w.id}
                      className="flex flex-col gap-1.5 border-b border-wood/40 pb-3 last:border-0 last:pb-0"
                    >
                      <ArtworkRow
                        work={w}
                        artists={artists}
                        suffix={` · Completed ${formatMonth(w.completedTick)}`}
                      />
                      {host ? (
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-ink-faint">
                            On display at {BUILDING_METADATA_BY_ID[host.buildingId]?.name}
                          </span>
                          <button
                            className="btn-quiet px-2 py-1"
                            onClick={() => recallArtwork(w.id)}
                          >
                            Recall
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            className="btn-quiet self-start px-2 py-1 text-xs"
                            onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                          >
                            Display at…
                          </button>
                          {expandedId === w.id &&
                            (hosts.length === 0 ? (
                              <span className="text-xs italic text-ink-faint">
                                No host with a free {slotKind} slot.
                              </span>
                            ) : (
                              hosts.map((h) => (
                                <button
                                  key={h.key}
                                  className="btn-primary px-2 py-1 text-left text-xs"
                                  onClick={() => {
                                    displayArtwork(w.id, h.key, h.slot);
                                    setExpandedId(null);
                                  }}
                                >
                                  {h.name}
                                </button>
                              ))
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </Panel>
          </div>
        </ModalBackdrop>
      )}
    </>
  );
}
