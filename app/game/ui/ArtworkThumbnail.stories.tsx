import type { Meta, StoryObj } from "@storybook/react-vite";

import { ArtworkThumbnail } from "./ArtworkThumbnail";

const meta = {
  title: "Primitives/ArtworkThumbnail",
  component: ArtworkThumbnail,
  parameters: { layout: "centered" },
  args: { title: "The Adoration of the Magi", variant: "gallery" },
  argTypes: {
    variant: { control: "radio", options: ["offer", "gallery"] },
  },
} satisfies Meta<typeof ArtworkThumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The compact thumbnail beside a commission offer. */
export const Offer: Story = {
  args: { variant: "offer", title: "Bust of Lorenzo" },
};

/** The larger framed thumbnail in the gallery codex. */
export const Gallery: Story = {
  args: { variant: "gallery", title: "Primavera" },
};
