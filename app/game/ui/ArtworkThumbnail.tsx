import { Crown } from "lucide-react";

import { RANK_LABEL } from "~/game/art/artists";
import { artworkQuality } from "~/game/art/display";
import type { Artist, Artwork } from "~/game/types";
import { capitalizeLabel } from "./format";

const VARIANT_CLASSES = {
  offer: "h-14 w-10 object-cover shadow-sm shadow-black/20",
  gallery: "h-16 w-12 shadow-md shadow-black/30",
} as const;

export function ArtworkThumbnail({
  title,
  variant,
}: {
  title: string;
  variant: keyof typeof VARIANT_CLASSES;
}) {
  return (
    <img
      src="/art-placeholder.svg"
      alt={title}
      className={`shrink-0 rounded-sm border border-wood/50 ${VARIANT_CLASSES[variant]}`}
    />
  );
}

// Shared artwork row (Gallery, DisplayPanel): thumbnail + name + artist +
// quality line. `suffix` appends to the quality line (e.g. completion date).
export function ArtworkRow({
  work,
  artists,
  suffix,
}: {
  work: Artwork;
  artists: Artist[];
  suffix?: string;
}) {
  const artist = artists.find((a) => a.id === work.artistId);
  return (
    <div className="flex items-center gap-3">
      <ArtworkThumbnail title={work.name} variant="gallery" />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="font-display text-sm font-semibold text-ink">{work.name}</span>
        <span className="text-xs text-ink-faint">
          {artist
            ? `${artist.name}, ${RANK_LABEL[artist.rank]} ${capitalizeLabel(work.artistType)}`
            : capitalizeLabel(work.artistType)}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-ink-faint">
          <Crown className="h-3 w-3 text-prestige-gold" /> {artworkQuality(work)}
          {work.requester ? ` · For ${work.requester}` : ""}
          {suffix}
        </span>
      </div>
    </div>
  );
}
