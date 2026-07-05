import type { MetaFunction } from "react-router";

import { BabylonCanvas } from "~/components/game/BabylonCanvas";
import { GameHUD } from "~/components/game/GameHUD";
import { useGameLoop } from "~/components/GameLoop";

export const meta: MetaFunction = () => {
  return [
    { title: "RenCity Builder" },
    { name: "description", content: "3D City Building Game" },
  ];
};

export default function GameWindow() {
  useGameLoop();

  return (
    <div className="w-full h-screen relative">
      <BabylonCanvas />
      <GameHUD />
    </div>
  );
}
