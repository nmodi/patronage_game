// Self-check for the ambience gain curve (zoom envelope × citywide↔local fade).
// Run: node --experimental-strip-types app/game/audio/ambience.check.ts
import assert from "node:assert";
import { existsSync } from "node:fs";

import { AMBIENCE_SRC, ambienceGain, ZOOM_FAR, ZOOM_NEAR, ZOOM_QUIET } from "./ambience.ts";

// The loop asset ships (same guard sfx.check.ts gives the SFX registry).
assert.ok(existsSync(`public${AMBIENCE_SRC}`), `missing public${AMBIENCE_SRC}`);

// Endpoints: empty city is silent at any zoom; a full crowd under the camera
// is 1 up close, and a full city is exactly the quiet floor zoomed out.
assert.equal(ambienceGain(0, ZOOM_NEAR, 0), 0);
assert.equal(ambienceGain(0, ZOOM_FAR, 0), 0);
assert.equal(ambienceGain(1000, ZOOM_NEAR, 1), 1);
assert.ok(Math.abs(ambienceGain(1000, ZOOM_FAR, 1) - ZOOM_QUIET) < 1e-9);

// Zoomed in, only the local crowd matters: a busy city with an empty focus
// point is silent, a busy focus point in a small city is full.
assert.equal(ambienceGain(1000, ZOOM_NEAR, 0), 0);
assert.equal(ambienceGain(5, ZOOM_NEAR, 1), 1);

// Zoomed out, local is irrelevant (citywide bustle at the quiet floor).
for (const r of [ZOOM_FAR, 500]) {
  assert.equal(ambienceGain(50, r, 0), ambienceGain(50, r, 1), `local-invariant at radius ${r}`);
}

// Radii outside the camera's clamp range clamp, never extrapolate.
assert.equal(ambienceGain(1000, 0, 1), 1);
assert.ok(Math.abs(ambienceGain(1000, 500, 1) - ZOOM_QUIET) < 1e-9);

// Monotonic non-decreasing in population, bounded 0..1 (principle 6:
// more people must never mean less bustle).
{
  let prev = 0;
  for (let pop = 0; pop <= 300; pop++) {
    const g = ambienceGain(pop, 40, 0.5);
    assert.ok(g >= prev && g <= 1, `monotonic in population, broke at pop ${pop}`);
    prev = g;
  }
}

// Monotonic non-decreasing in local crowd at fixed pop/zoom.
{
  let prev = 0;
  for (let local = 0; local <= 1; local += 0.01) {
    const g = ambienceGain(50, 10, local);
    assert.ok(g >= prev && g <= 1, `monotonic in local, broke at ${local}`);
    prev = g;
  }
}

// Monotonic non-increasing in radius: zooming out never gets louder — holds
// when the focus point is at least as busy as the city average.
{
  let prev = 2;
  for (let r = ZOOM_NEAR; r <= ZOOM_FAR; r++) {
    const g = ambienceGain(50, r, 1);
    assert.ok(g <= prev, `monotonic in radius, broke at radius ${r}`);
    prev = g;
  }
}

console.log("ambience.check: all assertions passed");
