import type { Meta, StoryObj } from "@storybook/react-vite";

import { gameState } from "../../../.storybook/withGameState";
import { sampleCity } from "../../../.storybook/mocks";
import { TopBar } from "./TopBar";

const meta = {
  title: "Panels/TopBar",
  component: TopBar,
  parameters: {
    layout: "fullscreen",
    backgrounds: { value: "canvas" },
  },
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The header bar over a mid-game city: date, speed controls, and the four
 * headline resources. Hover Prestige for the Renaissance checklist, Population
 * for the housing/amenity caps. */
export const MidGame: Story = {
  decorators: [gameState(sampleCity)],
};

/** A fresh city: starting florins, everything else at zero. */
export const NewCity: Story = {
  decorators: [gameState({ cityName: "Nuova Firenze" })],
};
