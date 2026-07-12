export const BASE_TICK_INTERVAL = 1500;
export const GAME_SPEED_MULTIPLIERS = [1, 2, 3] as const;

// 120 × 0.5 = a 60-unit world extent; the finer cells exist so roads can be
// narrower than buildings (path/road/avenue widths).
export const GRID_SIZE = 120;
export const CELL_SIZE = 0.5;

// Population grows only to this ceiling until service buildings raise it.
export const BASE_POPULATION_CAP = 15;
