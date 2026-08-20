import { Layers } from "lucide-react";

import { playSfx } from "~/game/audio/sfx";
import { AUTHORED_RGB, HEAT_BANDS, ORGANIC_RGB } from "~/game/render/gatheringOverlay";
import { useGameStore } from "~/stores/useGameStore";
import { HudToggleButton, Panel } from "./Panel";

// Map overlay toggle (Civ-style) + the active view's legend. One view today
// (gathering / formed plazas); more views become more buttons or a picker.
export function OverlayToggle() {
  const active = useGameStore((s) => s.activeOverlay);
  const setActiveOverlay = useGameStore((s) => s.setActiveOverlay);
  const open = active === "gathering";
  return (
    <div className="flex flex-col items-end gap-2">
      <HudToggleButton
        icon={Layers}
        label="Gathering overlay"
        open={open}
        onClick={() => {
          playSfx(open ? "close" : "open");
          setActiveOverlay(open ? null : "gathering");
        }}
      />
      {open && (
        <Panel className="w-52 px-3 py-2 text-xs text-ink">
          <div className="mb-1 font-display text-sm font-semibold">Gathering</div>
          {/* Legend swatches mirror the overlay's own map colors, not HUD chrome. */}
          <div className="flex items-center gap-2 py-0.5">
            <span className="flex h-3 w-3 shrink-0 overflow-hidden rounded-sm border border-ink-faint/40">
              {HEAT_BANDS.map((b) => (
                <span key={b.min} className="h-full flex-1" style={{ background: `rgb(${b.rgb})` }} />
              ))}
            </span>
            <span>Where crowds would linger — faint to full</span>
          </div>
          <LegendRow color={`rgb(${ORGANIC_RGB})`} label="Piazza — formed organically" />
          <LegendRow color={`rgb(${AUTHORED_RGB})`} label="Piazza — authored" />
          <div className="mt-1 text-ink-faint">
            Open ground warmer than the palest band, framed by the city, becomes a piazza.
          </div>
        </Panel>
      )}
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="h-3 w-3 shrink-0 rounded-sm border border-ink-faint/40"
        style={{ background: color }}
      />
      <span>{label}</span>
    </div>
  );
}
