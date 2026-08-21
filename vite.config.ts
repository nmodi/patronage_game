import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  // ponytail: `git log` is the changelog — commit messages here are already one
  // terse line each. The build date is the version a player quotes; matching it
  // to a commit is a `git log --since` away, no CHANGELOG.md to hand-maintain.
  define: {
    "import.meta.env.VITE_BUILD_DATE": JSON.stringify(
      new Date().toISOString().slice(0, 10),
    ),
  },
  // ponytail: esbuild's dep pre-bundling mangles @babylonjs/core's dynamic shader
  // imports (e.g. import("../Shaders/color.vertex.js")), causing it to fall back to
  // fetching nonexistent /src/Shaders/*.fx files. Exclude it from optimization.
  optimizeDeps: {
    exclude: ["@babylonjs/core"],
  },
});
