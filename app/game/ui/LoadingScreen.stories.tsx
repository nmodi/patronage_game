import type { Meta, StoryObj } from "@storybook/react-vite";

import { LoadingScreen } from "./LoadingScreen";

const meta = {
  title: "Screens/LoadingScreen",
  component: LoadingScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LoadingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomMessage: Story = {
  args: { message: "Carving the marble…" },
};
