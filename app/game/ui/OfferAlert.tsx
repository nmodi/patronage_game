import { useGameStore } from "~/stores/useGameStore";
import { DENOUNCE_PRESTIGE } from "~/game/constants";
import { CommissionMeta } from "./CommissionMeta";
import { Panel } from "./Panel";

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
            className="btn-secondary self-end px-2 py-1.5 text-sm"
            onClick={() => setDenounceAlert(null)}
          >
            Dismiss
          </button>
        </Panel>
      )}
      {offer && (
        <Panel header="A commission is offered" className="flex flex-col gap-1.5 text-sm">
          <span className="font-display text-base font-semibold text-ink">{offer.title}</span>
          <CommissionMeta commission={offer} />
          <div className="flex justify-end gap-2">
            <button
              className="btn-secondary px-2 py-1.5 text-sm"
              onClick={() => setOfferAlert(null)}
            >
              Later
            </button>
            <button
              className="btn-primary px-2 py-1.5 text-sm"
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
