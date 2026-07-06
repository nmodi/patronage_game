import type { BuildingType } from "./types";

// No runtime imports here: workers.check.ts runs this file under plain Node
// (type-only imports are stripped).

export interface StaffableBuilding {
  key: string;
  type: BuildingType;
  workersRequired: number;
  maxWorkers: number;
}

/**
 * Linear output multiplier for staffing above the minimum: 1x at workersRequired,
 * up to 1.5x at maxWorkers. Shared by tick.ts (applies it) and BuildingTooltip.tsx
 * (previews it) so they can't drift apart.
 */
export function staffingEfficiency(
  workersRequired: number,
  maxWorkers: number,
  workers: number
): number {
  if (workersRequired <= 0 || maxWorkers <= workersRequired) return 1;
  return 1 + (0.5 * Math.max(0, workers - workersRequired)) / (maxWorkers - workersRequired);
}

// essential > production > luxury (design doc); unlisted types trail.
const TYPE_PRIORITY: Partial<Record<BuildingType, number>> = {
  service: 0,
  materials: 1,
  artist: 2,
  city: 3,
};

/**
 * Two-pass allocation (design doc, Phase 4): pass 1 fills buildings to their
 * minimum staffing in priority order, pass 2 distributes the surplus up to
 * maxWorkers for efficiency bonuses. Stateless — recomputed from scratch each
 * tick, so workers are automatically reclaimed when housing shrinks or
 * buildings are removed.
 */
export function allocateWorkers(
  buildings: StaffableBuilding[],
  population: number
): Map<string, number> {
  // ponytail: key-order tiebreak; proximity-to-housing tiebreaker if it ever matters
  const ordered = buildings
    .filter((b) => b.workersRequired > 0)
    .sort(
      (a, b) =>
        (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9) ||
        a.key.localeCompare(b.key)
    );

  const assigned = new Map<string, number>();
  let pool = population;

  // Pass 1: minimum staffing. A building the remaining pool can't fully staff
  // gets nothing — partial staffing below minimum would strand workers that
  // could activate a smaller building further down the list.
  for (const b of ordered) {
    if (b.workersRequired <= pool) {
      assigned.set(b.key, b.workersRequired);
      pool -= b.workersRequired;
    } else {
      assigned.set(b.key, 0);
    }
  }

  // Pass 2: surplus up to maxWorkers, same order.
  for (const b of ordered) {
    if (pool === 0) break;
    const current = assigned.get(b.key)!;
    if (current === 0) continue;
    const extra = Math.min(pool, Math.max(0, b.maxWorkers - current));
    assigned.set(b.key, current + extra);
    pool -= extra;
  }

  return assigned;
}
