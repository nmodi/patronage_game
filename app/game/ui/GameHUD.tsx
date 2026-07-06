import { BuildingPalette } from "./BuildingPalette";
import { BuildingTooltip } from "./BuildingTooltip";
import { TopBar } from "./TopBar";

export function GameHUD() {
  return (
    <>
      <TopBar />
      <BuildingPalette />
      <BuildingTooltip />
    </>
  );
}
