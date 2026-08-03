// Self-check for the ambience gain curve (bustle × zoom closeness).
// Run: node --experimental-strip-types app/game/audio/ambience.check.ts
import assert from "node:assert";
import { existsSync } from "node:fs";

import { AMBIENCE_SRC, ambienceGain, ZOOM_FAR, ZOOM_NEAR, ZOOM_QUIET } from "./ambience.ts";

// The loop asset ships (same guard sfx.check.ts gives the SFX registry).
assert.ok(existsSync(`public${AMBIENCE_SRC}`), `missing public${AMBIENCE_SRC}`);

// Endpoints: empty city is silent at any zoom; a full crowd is 1 up close
// and exactly the quiet floor fully zoomed out.
assert.equal(ambienceGain(0, ZOOM_NEAR), 0);
assert.equal(ambienceGain(0, ZOOM_FAR), 0);
assert.equal(ambienceGain(1000, ZOOM_NEAR), 1);
assert.ok(Math.abs(ambienceGain(1000, ZOOM_FAR) - ZOOM_QUIET) < 1e-9);

// Radii outside the camera's clamp range clamp, never extrapolate.
assert.equal(ambienceGain(1000, 0), 1);
assert.ok(Math.abs(ambienceGain(1000, 500) - ZOOM_QUIET) < 1e-9);

// Monotonic non-decreasing in population, bounded 0..1 (principle 6:
// more people must never mean less bustle).
{
  let prev = 0;
  for (let pop = 0; pop <= 300; pop++) {
    const g = ambienceGain(pop, 40);
    assert.ok(g >= prev && g <= 1, `monotonic in population, broke at pop ${pop}`);
    prev = g;
  }
}

// Monotonic non-increasing in radius: zooming out never gets louder.
{
  let prev = 2;
  for (let r = ZOOM_NEAR; r <= ZOOM_FAR; r++) {
    const g = ambienceGain(50, r);
    assert.ok(g <= prev, `monotonic in radius, broke at radius ${r}`);
    prev = g;
  }
}

console.log("ambience.check: all assertions passed");
