import { execSync } from "node:child_process";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// ponytail: `git log` is the changelog — commit messages here are already one
// terse line each. Stamping each build with its commit means a version a player
// reports resolves to an exact tree (`git show <sha>`), with no CHANGELOG.md to
// hand-maintain and drift. Date is the human-facing version; sha is forensic.
function commitSha() {
  const ci = process.env.CF_PAGES_COMMIT_SHA; // set by Cloudflare Pages
  if (ci) return ci.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD").toString().trim();
  } catch {
    return "unknown"; // no git binary (docker image) and no CI env var
  }
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  define: {
    "import.meta.env.VITE_BUILD_DATE": JSON.stringify(
      new Date().toISOString().slice(0, 10),
    ),
    "import.meta.env.VITE_BUILD_SHA": JSON.stringify(commitSha()),
  },
  // ponytail: esbuild's dep pre-bundling mangles @babylonjs/core's dynamic shader
  // imports (e.g. import("../Shaders/color.vertex.js")), causing it to fall back to
  // fetching nonexistent /src/Shaders/*.fx files. Exclude it from optimization.
  optimizeDeps: {
    exclude: ["@babylonjs/core"],
  },
});
