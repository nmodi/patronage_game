import { Clock, Coins, Crown } from "lucide-react";

import { useGameStore } from "~/stores/useGameStore";
import { DENOUNCE_PRESTIGE } from "~/game/constants";
import { Panel } from "./Panel";
import { capitalizeLabel } from "./format";

/**
 * Persistent, non-blocking arrival card for a fresh commission offer (missing
 * one costs favor, so arrivals are unmissable), plus its darker sibling for a
 * faction's denunciation. Bottom-right, clear of the palette and panels.
 */
export function OfferAlert({ onView }: { onView: () => void }) {
  const offerAlert = useGameStore((s) => s.offerAlert);
  const denounceAlert = useGameStore((s) => s.denounceAlert);
  const commissions = useGameStore((s) => s.commissions);
  const setOfferAlert = useGameStore((s) => s.setOfferAlert);
  const setDenounceAlert = useGameStore((s) => s.setDenounceAlert);

  // A meanwhile-assigned or expired offer renders nothing.
  const offer = commissions.find((c) => c.id === offerAlert && !c.workshopKey);
  if (!offer && !denounceAlert) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 right-3 z-40 flex w-72 flex-col gap-2">
      {denounceAlert && (
        <Panel header="Denunciation" className="flex flex-col gap-1.5 text-sm">
          <span className="font-display text-base font-semibold text-sienna">
            {denounceAlert} denounces your patronage.
          </span>
          <span className="text-ink-faint">−{DENOUNCE_PRESTIGE} Prestige</span>
          <button
            className="self-end rounded bg-parchment-deep px-2 py-1.5 text-sm font-semibold text-ink transition hover:bg-wood/40"
            onClick={() => setDenounceAlert(null)}
          >
            Dismiss
          </button>
        </Panel>
      )}
      {offer && (
        <Panel header="A commission is offered" className="flex flex-col gap-1.5 text-sm">
          <span className="font-display text-base font-semibold text-ink">{offer.title}</span>
          <span className="flex flex-wrap items-center gap-1 text-ink-faint">
            {offer.requester} ·
            <Coins className="h-4 w-4 text-prestige-gold" /> {offer.florins}ƒ ·
            <Crown className="h-4 w-4 text-prestige-gold" /> {offer.prestige} ·
            <Clock className="h-4 w-4" /> {offer.durationMonths} mo
          </span>
          <span className="text-sm font-semibold text-sienna">
            Requires: {capitalizeLabel(offer.artistType)}
          </span>
          <div className="flex justify-end gap-2">
            <button
              className="rounded bg-parchment-deep px-2 py-1.5 text-sm font-semibold text-ink transition hover:bg-wood/40"
              onClick={() => setOfferAlert(null)}
            >
              Later
            </button>
            <button
              className="rounded bg-sienna px-2 py-1.5 text-sm font-semibold text-parchment transition hover:bg-sienna/85"
              onClick={() => {
                setOfferAlert(null);
                onView();
              }}
            >
              View
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}
