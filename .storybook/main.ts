import type { StorybookConfig } from "@storybook/react-vite";
import type { PluginOption } from "vite";

const pluginName = (plugin: unknown): string =>
  plugin && typeof plugin === "object" && "name" in plugin
    ? String((plugin as { name?: unknown }).name)
    : "";

const config: StorybookConfig = {
  stories: ["../app/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // Serves /art-placeholder.svg and other public assets the UI references.
  staticDirs: ["../public"],
  async viteFinal(viteConfig) {
    const tailwindcss = (await import("@tailwindcss/vite")).default;
    const tsconfigPaths = (await import("vite-tsconfig-paths")).default;

    // Storybook merges the app's vite.config.ts, which registers the React
    // Router SSR plugin. That plugin's configResolved guard throws under
    // Storybook's build (it expects a server entry stories don't have), so
    // strip it. Plugins arrive as nested arrays, only flattened by Vite later,
    // so flatten before filtering. Keep the tokens/paths plugins the UI needs;
    // re-add them if the merge didn't carry them, and disable the on-disk
    // config so it can't re-introduce React Router during resolveConfig.
    const existing = ((viteConfig.plugins ?? []) as PluginOption[])
      .flat(Infinity as 1)
      .filter(Boolean);
    const kept = existing.filter((p) => !pluginName(p).includes("react-router"));
    const names = kept.map(pluginName);

    const extras: PluginOption[] = [];
    if (!names.some((n) => n.includes("tailwind"))) extras.push(tailwindcss());
    if (!names.some((n) => n.includes("tsconfig"))) extras.push(tsconfigPaths());

    viteConfig.plugins = [...kept, ...extras];
    viteConfig.configFile = false;
    viteConfig.optimizeDeps = {
      ...(viteConfig.optimizeDeps ?? {}),
      exclude: ["@babylonjs/core", ...(viteConfig.optimizeDeps?.exclude ?? [])],
    };
    return viteConfig;
  },
};

export default config;
