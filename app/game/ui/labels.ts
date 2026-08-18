// Pure data: label/color maps shared by the overlay UI (data-module rule —
// icon maps live in buildingIcons.ts).
import { CHURCH } from "~/game/art/commissions";
import type { DisplaySlotKind } from "~/game/types";

/** Favor rung 0–3 → the standing shown on the faction card. */
export const RUNG_LABELS = ["Neutral", "Favored", "Esteemed", "Exalted"];

/** Patron crest colors for the hanging banners. */
export const BANNER_COLORS: Record<string, string> = {
  [CHURCH]: "var(--color-verde)",
  "House Medici": "var(--color-sienna)",
  "House Strozzi": "var(--color-prestige-gold)",
  "House Pazzi": "var(--color-crest-blue)",
};

/** Display-slot kind → the word shown for an empty slot. */
export const SLOT_LABEL: Record<DisplaySlotKind, string> = {
  painting: "painting",
  statue: "statue",
  plinth: "statue",
  fountain: "fountain",
};
