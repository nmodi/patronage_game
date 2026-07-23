import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { gameState } from "../../../.storybook/withGameState";
import { sampleCity } from "../../../.storybook/mocks";
import { ArtistsPanel } from "./ArtistsPanel";

const meta = {
  title: "Panels/ArtistsPanel",
  component: ArtistsPanel,
  parameters: { layout: "fullscreen" },
  args: { open: true, onToggle: fn() },
  decorators: [
    (Story) => (
      <div className="p-4" style={{ minHeight: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArtistsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two workshops: a busy painter's bottega and an idle master sculptor. */
export const Populated: Story = {
  decorators: [gameState(sampleCity)],
};

/** No workshops built yet — the empty-state nudge. */
export const Empty: Story = {
  decorators: [gameState({})],
};
