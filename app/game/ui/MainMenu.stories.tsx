import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { MainMenu } from "./MainMenu";

const meta = {
  title: "Screens/MainMenu",
  component: MainMenu,
  parameters: { layout: "fullscreen" },
  args: { onStart: fn() },
} satisfies Meta<typeof MainMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First boot: no save exists, so only New Game and the demo tour show. */
export const NewPlayer: Story = {
  decorators: [
    (Story) => {
      localStorage.removeItem("patronage-save");
      return <Story />;
    },
  ],
};

/** A compatible save exists — the Continue button appears with the city and date. */
export const ReturningPlayer: Story = {
  decorators: [
    (Story) => {
      localStorage.setItem(
        "patronage-save",
        JSON.stringify({
          version: 7,
          state: { cityName: "Firenze", time: { tickCount: 78 } },
        }),
      );
      return <Story />;
    },
  ],
};
