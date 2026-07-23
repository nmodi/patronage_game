import type { Preview } from "@storybook/react-vite";

// The app's Tailwind entry + design tokens (--color-parchment, fonts, the
// .panel-parchment paper texture) — everything the UI styling depends on.
import "../app/app.css";

// root.tsx loads the display/body fonts via <link> in the document head;
// Storybook renders outside that document, so inject the same stylesheet.
if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Sorts+Mill+Goudy:ital@0;1&display=swap";
  document.head.appendChild(link);
}

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Match the game's surfaces so panels/screens read in a true context.
    backgrounds: {
      options: {
        parchment: { name: "Parchment", value: "#f9f5ec" },
        night: { name: "Night sky", value: "#1b2340" },
        canvas: { name: "City canvas", value: "#9db97a" },
        ink: { name: "Ink", value: "#453824" },
      },
    },
    a11y: { test: "todo" },
  },
  initialGlobals: {
    backgrounds: { value: "parchment" },
  },
};

export default preview;
