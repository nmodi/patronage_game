import type { ReactNode } from "react";
import { Clock, Coins, Crown } from "./gameIcons";

import { commissionMaterial, commissionMaterialCost } from "~/game/art/materials";
import type { Commission } from "~/game/types";
import { capitalizeLabel } from "./format";

/**
 * The two lines every offer card shares (CommissionsPanel, OfferAlert):
 * requester · florins · prestige · duration, then the "Requires: …" line.
 * `nth` appends "— Nth work" flavor; `requiresExtra` appends to the
 * requirements line (blueprint / expiry notes).
 */
export function CommissionMeta({
  commission,
  nth,
  requiresExtra,
}: {
  commission: Commission;
  nth?: string;
  requiresExtra?: ReactNode;
}) {
  const material = commissionMaterial(commission);
  const cost = commissionMaterialCost(commission);
  return (
    <>
      <span className="flex flex-wrap items-center gap-1 text-sm text-ink-faint">
        {commission.requester}
        {nth} ·
        <Coins className="h-4 w-4 text-prestige-gold" /> {commission.florins}ƒ ·
        <Crown className="h-4 w-4 text-prestige-gold" /> {commission.prestige} ·
        <Clock className="h-4 w-4" /> {commission.durationMonths} mo
      </span>
      <span className="text-sm font-semibold text-sienna">
        Requires: {capitalizeLabel(commission.artistType)}
        {material && (
          <span>
            {" "}
            · {capitalizeLabel(material)}
            {cost > 0 && ` ${cost}`}
          </span>
        )}
        {requiresExtra}
      </span>
    </>
  );
}
