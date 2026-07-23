import { Coins, Crown, Feather, Users } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { ResourceStat } from "./ResourceStat";

const meta = {
  title: "Primitives/ResourceStat",
  component: ResourceStat,
  parameters: { layout: "centered" },
  args: { icon: Coins, label: "Florins", value: "640ƒ" },
} satisfies Meta<typeof ResourceStat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Florins: Story = {
  args: { icon: Coins, label: "Florins", value: "640ƒ", iconClassName: "text-prestige-gold" },
};

export const Inspiration: Story = {
  args: { icon: Feather, label: "Inspiration", value: 32, iconClassName: "text-sienna" },
};

export const Prestige: Story = {
  args: { icon: Crown, label: "Prestige", value: 214, iconClassName: "text-prestige-gold" },
};

export const Population: Story = {
  args: { icon: Users, label: "Population", value: 38, iconClassName: "text-sienna" },
};

/** All four headline stats as they sit in the top bar. */
export const TopBarRow: StoryObj = {
  render: () => (
    <div className="flex items-center gap-6">
      <ResourceStat icon={Coins} label="Florins" value="640ƒ" iconClassName="text-prestige-gold" />
      <ResourceStat icon={Feather} label="Inspiration" value={32} iconClassName="text-sienna" />
      <ResourceStat icon={Crown} label="Prestige" value={214} iconClassName="text-prestige-gold" />
      <ResourceStat icon={Users} label="Population" value={38} iconClassName="text-sienna" />
    </div>
  ),
};
