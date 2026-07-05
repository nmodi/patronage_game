import { useEffect } from "react";
import type { MetaFunction } from "react-router";

import { BabylonCanvas } from "~/components/game/BabylonCanvas";
import { GameHUD } from "~/components/game/GameHUD";
import { useGameLoop } from "~/components/GameLoop";
import { seedDemoCity } from "~/game/demoCity";
import { useGameStore } from "~/stores/useGameStore";

export const meta: MetaFunction = () => {
  return [
    { title: "RenCity Builder" },
    { name: "description", content: "3D City Building Game" },
  ];
};

export default function GameWindow() {
  useGameLoop();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (window.location.search.includes("demo")) seedDemoCity();
    if (window.location.search.includes("pause")) useGameStore.getState().setPaused(true);
  }, []);

  return (
    <div className="w-full h-screen relative">
      <BabylonCanvas />
      <GameHUD />
    </div>
  );
}
