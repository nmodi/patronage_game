import { useState } from "react";

import { ArtistsPanel } from "./ArtistsPanel";
import { BuildingPalette } from "./BuildingPalette";
import { BuildingTooltip } from "./BuildingTooltip";
import { CommissionsPanel } from "./CommissionsPanel";
import { DisplayPanel } from "./DisplayPanel";
import { FactionBanner } from "./FactionBanner";
import { GalleryPanel } from "./GalleryPanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { OfferAlert } from "./OfferAlert";
import { RazeConfirm } from "./RazeConfirm";
import { RenaissanceCard } from "./RenaissanceCard";
import { TopBar } from "./TopBar";

export function GameHUD() {
  // One HUD panel open at a time — their dropdowns overlap otherwise.
  const [openPanel, setOpenPanel] = useState<"artists" | "commissions" | null>(null);
  const toggle = (panel: "artists" | "commissions") => () =>
    setOpenPanel((p) => (p === panel ? null : panel));

  return (
    <>
      <TopBar />
      <div className="pointer-events-none fixed left-3 top-16 z-40 flex gap-2">
        <ArtistsPanel open={openPanel === "artists"} onToggle={toggle("artists")} />
        <CommissionsPanel open={openPanel === "commissions"} onToggle={toggle("commissions")} />
        <GalleryPanel />
      </div>
      <div className="pointer-events-none fixed right-6 top-16 z-40 flex flex-col items-end gap-2">
        <FactionBanner />
      </div>
      {/* Materials rail: docked flush to the right screen edge, own width. */}
      <div className="pointer-events-none fixed left-0 top-1/2 z-40 -translate-y-1/2">
        <MaterialsPanel />
      </div>
      <OfferAlert onView={() => setOpenPanel("commissions")} />
      <BuildingPalette hasOpenPanel={openPanel != null} onClosePanel={() => setOpenPanel(null)} />
      <BuildingTooltip />
      <RazeConfirm />
      <DisplayPanel />
      <RenaissanceCard />
    </>
  );
}
