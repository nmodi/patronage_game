import { useMemo, type ReactNode } from "react";
import type { Decorator } from "@storybook/react-vite";

import { useGameStore, type GameState } from "~/stores/useGameStore";

/**
 * Seed the singleton game store for a story from a clean baseline.
 *
 * Most UI panels read `useGameStore` directly rather than taking props, so a
 * story renders them against real store state. `resetGame("story")` gives a
 * deterministic default city; the patch layers on the scene the story wants
 * (artists, tiles, resources). Applied once per mount in `useMemo` — before
 * children render — so the panel reads the seeded state on its first paint.
 */
export function gameState(patch: Partial<GameState> = {}): Decorator {
  return function GameStateDecorator(Story) {
    return (
      <SeedStore patch={patch}>
        <Story />
      </SeedStore>
    );
  };
}

function SeedStore({ patch, children }: { patch: Partial<GameState>; children: ReactNode }) {
  useMemo(() => {
    useGameStore.getState().resetGame("story");
    if (Object.keys(patch).length > 0) useGameStore.setState(patch);
  }, []);
  return <>{children}</>;
}
