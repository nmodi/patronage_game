// Self-check for the two-pass worker allocation.
// Run: node --experimental-strip-types app/game/workers.check.ts
import assert from "node:assert";

import { allocateWorkers, staffingEfficiency, type StaffableBuilding } from "./workers.ts";

const b = (
  key: string,
  type: StaffableBuilding["type"],
  workersRequired: number,
  maxWorkers: number
): StaffableBuilding => ({ key, type, workersRequired, maxWorkers });

// Scarcity: fills by priority (service > materials > artist), skips what the
// remaining pool can't fully staff instead of stranding partial workers.
{
  const out = allocateWorkers(
    [b("w", "artist", 2, 4), b("m", "materials", 3, 6), b("s", "service", 1, 2)],
    4
  );
  assert.equal(out.get("s"), 1);
  assert.equal(out.get("m"), 3);
  assert.equal(out.get("w"), 0);
}

// Surplus: pass 2 tops up to maxWorkers, never beyond.
{
  const out = allocateWorkers([b("s", "service", 1, 2), b("w", "artist", 2, 4)], 10);
  assert.equal(out.get("s"), 2);
  assert.equal(out.get("w"), 4);
  assert.equal([...out.values()].reduce((sum, n) => sum + n, 0), 6);
}

// Determinism: equal priority ties break by key, regardless of input order.
{
  const a1 = allocateWorkers([b("b", "artist", 2, 2), b("a", "artist", 2, 2)], 2);
  const a2 = allocateWorkers([b("a", "artist", 2, 2), b("b", "artist", 2, 2)], 2);
  assert.equal(a1.get("a"), 2);
  assert.equal(a1.get("b"), 0);
  assert.deepEqual([...a1.entries()].sort(), [...a2.entries()].sort());
}

// Buildings without staffing needs are ignored entirely.
{
  const out = allocateWorkers([b("plaza", "city", 0, 0)], 5);
  assert.equal(out.size, 0);
}

// Efficiency: 1x at minimum, linear ramp to 1.5x at maxWorkers, clamped at/below minimum.
{
  assert.equal(staffingEfficiency(2, 4, 2), 1);
  assert.equal(staffingEfficiency(2, 4, 4), 1.5);
  assert.equal(staffingEfficiency(2, 4, 3), 1.25);
  assert.equal(staffingEfficiency(0, 0, 5), 1);
}

console.log("workers.check: all assertions passed");
