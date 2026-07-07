import { useEffect } from "react";
import type { MetaFunction } from "react-router";

import { BabylonCanvas } from "~/game/render/BabylonCanvas";
import { GameHUD } from "~/game/ui/GameHUD";
import { useGameShortcuts } from "~/game/ui/useGameShortcuts";
import { useGameLoop } from "~/game/ui/useGameLoop";
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
  useGameShortcuts();

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
