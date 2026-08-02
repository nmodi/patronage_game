// Self-check for the era pick + lower-era fallback.
// Run: node --experimental-strip-types app/game/music.check.ts
import assert from "node:assert";

import { ERA_PRESTIGE, TRACKS, pickTrack } from "./music.ts";

// Every track sits in a real era band.
for (const t of TRACKS) assert(t.era >= 0 && t.era < ERA_PRESTIGE.length);

// Any prestige — including eras with no tracks yet — resolves to a real track.
for (const prestige of [0, ERA_PRESTIGE[1], ERA_PRESTIGE[2], 10_000]) {
  for (let i = 0; i < 50; i++) {
    const src = pickTrack(prestige, null);
    assert(TRACKS.some((t) => t.src === src), `no track for prestige ${prestige}`);
  }
}

// With more than one candidate, never repeat the last track.
const last = TRACKS[0].src;
for (let i = 0; i < 200; i++) assert.notStrictEqual(pickTrack(0, last), last);

console.log("music.check.ts: all checks passed");
