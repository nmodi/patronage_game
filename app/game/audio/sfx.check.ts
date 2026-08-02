// Self-check: every registry path has a real file in public/. Scans the
// source instead of importing sfx.ts — its store import pulls in
// import.meta.env, which plain node doesn't provide.
// Run: node --experimental-strip-types app/game/audio/sfx.check.ts
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";

const src = readFileSync(new URL("./sfx.ts", import.meta.url), "utf8");
const paths = [...src.matchAll(/"(\/sfx\/[^"]+)"/g)].map((m) => m[1]);

assert(paths.length >= 15, `registry looks truncated (${paths.length} entries)`);
assert(new Set(paths).size === paths.length, "duplicate sfx paths");
for (const p of paths) {
  assert(existsSync(new URL(`../../../public${p}`, import.meta.url)), `missing file for ${p}`);
}

console.log(`sfx.check.ts: ${paths.length} sounds present`);
