import { useState } from "react";
import { createPortal } from "react-dom";
import { Crown, Images, X } from "lucide-react";

import { formatMonth, useGameStore } from "~/stores/useGameStore";
import { RANK_LABEL } from "~/game/artists";
import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { artworkQuality, canDisplayWork } from "~/game/display";
import { Panel } from "./Panel";
import { ArtworkThumbnail } from "./ArtworkThumbnail";
import { capitalizeLabel } from "./format";

// Circular HUD button (top-left row) + fullscreen codex modal.
export function GalleryPanel() {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const artworks = useGameStore((s) => s.artworks);
  const artists = useGameStore((s) => s.artists);
  const tiles = useGameStore((s) => s.map.tiles);
  const displayArtwork = useGameStore((s) => s.displayArtwork);
  const recallArtwork = useGameStore((s) => s.recallArtwork);

  return (
    <>
      <button
        data-hud="true"
        className={`panel-parchment pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-ink transition ${
          open ? "ring-2 ring-sienna" : ""
        }`}
        onClick={() => setOpen(true)}
        aria-label="Gallery"
        title="Gallery"
      >
        <Images className="h-5 w-5 text-sienna" strokeWidth={1.75} />
      </button>
      {/* Portal: keeps the fixed modal out of the TopBar panel's stacking
          context so it can't get pinned to the panel. */}
      {open && createPortal(
        <div
          data-hud="true"
          className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div className="w-[28rem]" onClick={(e) => e.stopPropagation()}>
            <Panel
              header={
                <div className="flex items-center justify-between">
                  <span>Gallery of Works ({artworks.length})</span>
                  <button
                    className="rounded-full p-1 text-ink-faint transition hover:bg-parchment-deep"
                    onClick={() => setOpen(false)}
                    aria-label="Close gallery"
                  >
                    <X className="h-4 w-4" />
                  </button>
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
                  const artist = artists.find((a) => a.id === w.artistId);
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
                      <div className="flex items-center gap-3">
                        <ArtworkThumbnail title={w.name} variant="gallery" />
                        <div className="flex min-w-0 flex-1 flex-col leading-tight">
                          <span className="font-display text-sm font-semibold text-ink">
                            {w.name}
                          </span>
                          <span className="text-xs text-ink-faint">
                            {artist
                              ? `${artist.name}, ${RANK_LABEL[artist.rank]} ${capitalizeLabel(w.artistType)}`
                              : capitalizeLabel(w.artistType)}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-ink-faint">
                            <Crown className="h-3 w-3 text-prestige-gold" /> {artworkQuality(w)}
                            {w.requester ? ` · For ${w.requester}` : ""} · Completed{" "}
                            {formatMonth(w.completedTick)}
                          </span>
                        </div>
                      </div>
                      {host ? (
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-ink-faint">
                            On display at {BUILDING_METADATA_BY_ID[host.buildingId]?.name}
                          </span>
                          <button
                            className="rounded border border-wood/50 bg-parchment-deep px-2 py-1 font-semibold text-sienna transition hover:bg-wood/30"
                            onClick={() => recallArtwork(w.id)}
                          >
                            Recall
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            className="self-start rounded border border-wood/50 bg-parchment-deep px-2 py-1 text-xs font-semibold text-sienna transition hover:bg-wood/30"
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
                                  className="rounded bg-sienna px-2 py-1 text-left text-xs font-semibold text-parchment transition hover:bg-sienna/85"
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
        </div>,
        document.body,
      )}
    </>
  );
}
