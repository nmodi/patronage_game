#!/usr/bin/env python3
"""Compile the chosen game-icons.net glyphs into app/game/ui/gameIcons.tsx.

Source SVGs live beside this script in scripts/game-icons/ (from game-icons.net,
CC BY 3.0). Each icon is recolored to a single flat `currentColor` fill and
emitted as a React component named after the lucide-react icon it replaces, so
call sites only change their import source, never their JSX.

To swap or add an icon: drop its SVG in scripts/game-icons/, edit CHOSEN, rerun
this script, and update CREDITS.md's Interface-icons table. Prints that table to
stdout as a convenience — it does NOT touch CREDITS.md (which holds other credits).

    python3 scripts/gen-game-icons.py
"""
import json, re, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "game-icons")
TSX = os.path.join(HERE, "..", "app/game/ui/gameIcons.tsx")

# lucide-react component name -> chosen game-icons.net icon (from the icon-audit artifact)
CHOSEN = {
    "Coins": "two-coins", "Feather": "candle-light", "Crown": "laurel-crown", "Users": "backup",
    "Home": "family-house", "Store": "basket", "Settings": "cog", "Pencil": "quill",
    "Images": "mona-lisa", "Scroll": "scroll-quill", "Clock": "hourglass", "Paintbrush": "paint-brush",
    "Church": "church", "Shield": "cross-shield", "Road": "calendar-half-year", "Landmark": "greek-temple",
    "Wheat": "wheat", "Hammer": "claw-hammer", "Pickaxe": "mining", "Palette": "paint-bucket",
    "Gem": "stone-block", "Medal": "metal-bar", "TreePine": "pine-tree", "Mountain": "stone-pile",
    "DraftingCompass": "compass", "Castle": "capitol", "Cross": "crucifix", "Columns3": "ionic-column",
    "Bell": "stone-tower", "Building2": "family-house", "Warehouse": "warehouse",
    "Beer": "beer-stein", "Tent": "basket", "Grape": "grapes", "Shovel": "trowel", "Footprints": "trail",
    "Waves": "stone-bridge", "TreeDeciduous": "fruit-tree", "Trees": "birch-trees",
    "Droplets": "fountain", "Pyramid": "obelisk", "Shrub": "berry-bush", "BrickWall": "brick-wall",
    "PersonStanding": "stone-bust", "Fence": "wooden-fence", "Village": "village", "Rock": "rock",
    "Powder": "powder", "WoodBeam": "wood-beam",
}
# game-icons.net authors (CC BY 3.0 attribution) — see CREDITS.md
AUTHORS = {
    "backup": "Lorc", "basket": "Delapouite", "beer-stein": "Lorc",
    "berry-bush": "Delapouite", "birch-trees": "Caro Asercion", "brick-wall": "Delapouite",
    "candle-light": "Lorc", "calendar-half-year": "Delapouite", "capitol": "Lorc", "church": "Delapouite", "claw-hammer": "Lorc",
    "cog": "Lorc", "compass": "Lorc", "cross-shield": "Delapouite",
    "crucifix": "Delapouite", "family-house": "Delapouite", "fountain": "Lorc", "fruit-tree": "Delapouite",
    "grapes": "Lorc", "greek-temple": "Delapouite", "hourglass": "Lorc", "ionic-column": "Delapouite",
    "laurel-crown": "Lorc", "metal-bar": "Lorc", "mining": "Lorc", "obelisk": "Delapouite",
    "mona-lisa": "Delapouite", "paint-brush": "Delapouite", "paint-bucket": "Delapouite", "pine-tree": "Lorc",
    "quill": "Lorc", "rock": "Lorc", "scroll-quill": "Delapouite", "stone-block": "Lorc", "stone-bridge": "Delapouite",
    "stone-bust": "Delapouite", "stone-pile": "Delapouite", "stone-tower": "Lorc",
    "trail": "Delapouite", "trowel": "Delapouite", "two-coins": "Delapouite", "village": "Delapouite", "warehouse": "Delapouite",
    "wheat": "Lorc", "wooden-fence": "Lorc", "powder": "Lorc", "wood-beam": "Delapouite",
}


def normalize(text):
    """game-icons are 2-colour (white foreground on a default-black bg layer).
    Recolor white -> currentColor, black -> none, and default the root fill to none
    so the un-attributed bg layer stays transparent."""
    vb = re.search(r'viewBox="([^"]+)"', text).group(1)
    inner = re.search(r"<svg[^>]*>(.*)</svg>", text, re.S).group(1).strip()
    inner = re.sub(r'(fill|stroke)="(#fff|#ffffff|white)"', r'\1="currentColor"', inner, flags=re.I)
    inner = re.sub(r'(fill|stroke)="(#000|#000000|black)"', r'\1="none"', inner, flags=re.I)
    inner = re.sub(r"\s+", " ", inner)
    return vb, inner


HEADER = '''// AUTO-GENERATED — do not edit by hand. Regenerate: python3 scripts/gen-game-icons.py
// game-icons.net glyphs (CC BY 3.0), chosen in the icon-audit artifact as swaps for
// lucide-react. Recolored to a single currentColor fill; no other changes.
// Per-icon authors: CREDITS.md. Source SVGs: scripts/game-icons/.
import type { CSSProperties, ReactNode } from "react";

export type IconProps = {
  className?: string;
  size?: number | string;
  /** Accepted for lucide API parity; game-icons are fill glyphs, so it is ignored. */
  strokeWidth?: number;
  style?: CSSProperties;
};
export type IconComponent = (props: IconProps) => ReactNode;

function icon(viewBox: string, inner: string): IconComponent {
  return function GameIcon({ className, size, style }: IconProps) {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        aria-hidden="true"
        focusable="false"
        style={style}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    );
  };
}
'''


def main():
    lines = [HEADER]
    for lucide, gi in CHOSEN.items():
        vb, inner = normalize(open(os.path.join(SRC, f"{gi}.svg")).read())
        lines.append(f"export const {lucide} = /* {gi} */ icon({json.dumps(vb)}, {json.dumps(inner)});")
    open(TSX, "w").write("\n".join(lines) + "\n")
    print(f"wrote {os.path.relpath(TSX)} ({len(CHOSEN)} icons)")

    # convenience: the CREDITS.md Interface-icons table (paste manually; not auto-written)
    friendly = {}
    for lucide, gi in CHOSEN.items():
        friendly.setdefault(gi, []).append(lucide)
    print("\n--- CREDITS.md table ---")
    print("| Used for | game-icons.net icon | Author |")
    print("| --- | --- | --- |")
    for gi in sorted(friendly):
        print(f"| {', '.join(friendly[gi])} | `{gi}` | {AUTHORS.get(gi, '?')} |")


if __name__ == "__main__":
    main()
