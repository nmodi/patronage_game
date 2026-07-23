import type { Meta, StoryObj } from "@storybook/react-vite";

import { gameState } from "../../../.storybook/withGameState";
import { sampleCity } from "../../../.storybook/mocks";
import { RazeConfirm } from "./RazeConfirm";

const meta = {
  title: "Panels/RazeConfirm",
  component: RazeConfirm,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RazeConfirm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The confirm card for a raze that hurts — the target painter's workshop houses
 * two artists and is mid-commission, so the card spells out the consequences.
 */
export const CostlyRaze: Story = {
  decorators: [gameState({ ...sampleCity, razeTarget: "10,10" })],
};
