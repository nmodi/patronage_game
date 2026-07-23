import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { gameState } from "../../../.storybook/withGameState";
import { sampleCity } from "../../../.storybook/mocks";
import { CommissionsPanel } from "./CommissionsPanel";

const meta = {
  title: "Panels/CommissionsPanel",
  component: CommissionsPanel,
  parameters: { layout: "fullscreen" },
  args: { open: true, onToggle: fn() },
  decorators: [
    (Story) => (
      <div className="p-4" style={{ minHeight: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CommissionsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One commission in progress plus two open offers — the sculptor offer is
 * assignable to the idle master, the painter offer has no idle workshop.
 */
export const WithOffers: Story = {
  decorators: [gameState(sampleCity)],
};

/** No offers on the board yet. */
export const Empty: Story = {
  decorators: [gameState({})],
};
