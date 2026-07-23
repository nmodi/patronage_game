import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { gameState } from "../../../.storybook/withGameState";
import { sampleCity } from "../../../.storybook/mocks";
import { GalleryPanel } from "./GalleryPanel";

const meta = {
  title: "Panels/GalleryPanel",
  component: GalleryPanel,
  parameters: { layout: "centered" },
  decorators: [gameState(sampleCity)],
} satisfies Meta<typeof GalleryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Just the circular HUD button that opens the codex. */
export const Button: Story = {};

/** The gallery codex modal, opened via the button (renders through a portal). */
export const Opened: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Gallery" }));
    // The modal portals to document.body, so assert against the whole screen.
    await waitFor(() =>
      expect(within(document.body).getByText(/Gallery of Works/)).toBeInTheDocument(),
    );
  },
};
