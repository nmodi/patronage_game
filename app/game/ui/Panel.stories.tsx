import { useState } from "react";
import { Scroll, Users } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { HudPanel, Panel } from "./Panel";

const meta = {
  title: "Primitives/Panel",
  component: Panel,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The parchment card that wraps every floating UI surface. */
export const Basic: Story = {
  args: {
    header: "A Parchment Panel",
    className: "w-72 text-sm text-ink",
    children:
      "Panels carry the game's paper texture, a small-caps display header, and the double hairline border. Everything floating in the HUD is built on this.",
  },
};

export const Headerless: Story = {
  args: {
    className: "w-64 text-sm text-ink",
    children: "Without a header the card is just a bordered slab of parchment.",
  },
};

/** The circular HUD button that toggles a floating card below it. */
export const Hud: StoryObj = {
  parameters: { layout: "padded" },
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(true);
      return (
        <div className="flex gap-3 p-8">
          <HudPanel
            icon={Users}
            label="Artists"
            header="Artists & Workshops"
            open={open}
            onToggle={() => setOpen((o) => !o)}
            className="text-sm text-ink"
          >
            Click the button to toggle this card. Only one HUD panel opens at a time in the game.
          </HudPanel>
          <HudPanel
            icon={Scroll}
            label="Commissions"
            header="Commissions"
            open={false}
            onToggle={() => {}}
            count={3}
            countClassName="bg-sienna"
          >
            A closed panel with an attention badge.
          </HudPanel>
        </div>
      );
    }
    return <Demo />;
  },
};
