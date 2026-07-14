import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";

import { BabylonCanvas } from "~/game/render/BabylonCanvas";
import { GameHUD } from "~/game/ui/GameHUD";
import { MainMenu } from "~/game/ui/MainMenu";
import { useGameShortcuts } from "~/game/ui/useGameShortcuts";
import { useGameLoop } from "~/game/ui/useGameLoop";
import { seedDemoCity } from "~/game/demoCity";
import { isDemo, useGameStore } from "~/stores/useGameStore";

export const meta: MetaFunction = () => {
  return [
    { title: "Patronage" },
    { name: "description", content: "Renaissance Era City Builder" },
  ];
};

export default function GameRoute() {
  // Boot lands on the main menu; ?demo skips straight into the demo city
  // (the menu's tour link — no longer dev-only; its storage is a no-op, so
  // it never touches the real save). Hydrating the save is the menu's job
  // (Continue), so just visiting never clobbers it.
  const [screen, setScreen] = useState<"menu" | "game">("menu");

  useEffect(() => {
    if (!isDemo()) return;
    seedDemoCity();
    if (window.location.search.includes("pause")) useGameStore.getState().setPaused(true);
    setScreen("game");
  }, []);

  if (screen === "menu") return <MainMenu onStart={() => setScreen("game")} />;
  return <GameWindow />;
}

function GameWindow() {
  useGameLoop();
  useGameShortcuts();
  // Remount the canvas when the run seed changes (New Game): the whole
  // seed-shaped world (terrain, water, scatter) rebuilds through the normal
  // mount path instead of needing selective rebuild plumbing.
  const seed = useGameStore((s) => s.seed);

  return (
    <div className="w-full h-screen relative">
      <BabylonCanvas key={seed} />
      <GameHUD />
    </div>
  );
}
