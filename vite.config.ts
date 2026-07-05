import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  // ponytail: esbuild's dep pre-bundling mangles @babylonjs/core's dynamic shader
  // imports (e.g. import("../Shaders/color.vertex.js")), causing it to fall back to
  // fetching nonexistent /src/Shaders/*.fx files. Exclude it from optimization.
  optimizeDeps: {
    exclude: ["@babylonjs/core"],
  },
});
