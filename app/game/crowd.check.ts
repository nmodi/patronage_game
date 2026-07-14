import assert from "node:assert";

import { CROWD_TUNING, crowdSize } from "./crowd.ts";

const PLENTY = 100_000; // walkable cells that never bind

// Exact-match regime: low, countable populations map 1:1.
{
  assert.equal(crowdSize(0, PLENTY), 0);
  assert.equal(crowdSize(1, PLENTY), 1);
  assert.equal(crowdSize(7, PLENTY), 7);
  assert.equal(crowdSize(CROWD_TUNING.exactMatchMax, PLENTY), CROWD_TUNING.exactMatchMax);
}

// Defensive inputs: negatives clamp to zero, fractions round.
{
  assert.equal(crowdSize(-5, PLENTY), 0);
  assert.equal(crowdSize(7.4, PLENTY), 7);
  assert.equal(crowdSize(7.6, PLENTY), 8);
}

// Sublinear regime: grows past the exact range but far slower than population.
{
  const at100 = crowdSize(100, PLENTY);
  assert.ok(at100 > CROWD_TUNING.exactMatchMax, "keeps growing past the exact range");
  assert.ok(crowdSize(1000, PLENTY) < 1000 / 2, "well under half the population by 1000");
  // Spot values pin the curve shape: 20 + round(6·√80) = 74.
  assert.equal(at100, 74);
  assert.equal(crowdSize(1000, PLENTY), 208);
}

// Monotonic non-decreasing across the whole range (no seam at the regime switch).
{
  let prev = 0;
  for (let pop = 0; pop <= 3000; pop += 1) {
    const n = crowdSize(pop, PLENTY);
    assert.ok(n >= prev, `crowdSize dipped at pop ${pop}: ${prev} -> ${n}`);
    prev = n;
  }
}

// Hard cap.
{
  assert.equal(crowdSize(1_000_000, PLENTY), CROWD_TUNING.cap);
}

// Walk-network density clamp: never more than one figure per cellsPerCitizen
// cells, and zero walkable cells means zero figures regardless of population.
{
  assert.equal(crowdSize(50, 10), Math.floor(10 / CROWD_TUNING.cellsPerCitizen));
  assert.equal(crowdSize(3, 10), 3, "clamp must not bind below its ceiling");
  assert.equal(crowdSize(50, 0), 0);
  assert.equal(crowdSize(0, 0), 0);
}

console.log("crowd.check.ts passed");
