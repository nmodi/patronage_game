import { ArtistsPanel } from "./ArtistsPanel";
import { BuildingPalette } from "./BuildingPalette";
import { BuildingTooltip } from "./BuildingTooltip";
import { CommissionsPanel } from "./CommissionsPanel";
import { TopBar } from "./TopBar";

export function GameHUD() {
  return (
    <>
      <TopBar />
      <ArtistsPanel />
      <CommissionsPanel />
      <BuildingPalette />
      <BuildingTooltip />
    </>
  );
}
