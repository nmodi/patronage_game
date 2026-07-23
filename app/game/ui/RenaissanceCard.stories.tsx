import type { Meta, StoryObj } from "@storybook/react-vite";

import { gameState } from "../../../.storybook/withGameState";
import { sampleCity } from "../../../.storybook/mocks";
import { RenaissanceCard } from "./RenaissanceCard";

const meta = {
  title: "Screens/RenaissanceCard",
  component: RenaissanceCard,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RenaissanceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The one-shot victory card. It renders only when all four Renaissance gates
 * hold and the celebration hasn't been dismissed — so the story seeds a city
 * that has just crossed the threshold (a displayed Wonder, a Master, works for
 * the Church and two noble houses, prestige over the line).
 */
export const Reached: Story = {
  decorators: [
    gameState({
      ...sampleCity,
      prestige: 600,
      renaissanceReached: false,
    }),
  ],
};
