/** Night-sky backdrop (DS `--surface-night`) shared by the main menu and the loading screen. */
export const NIGHT_SKY_BG =
  "radial-gradient(circle at 50% 30%, var(--color-crest-blue) 0%, var(--color-crest-blue-deep) 55%, #111731 100%)";

// Star positions (% of viewport) from the design system's main-menu mock.
const STARS: [number, number, number][] = [
  [9.4, 12.5, 1.4],
  [24.2, 23.6, 1],
  [40.6, 8.3, 1.8],
  [59.4, 18.1, 1.1],
  [72.7, 11.1, 1.5],
  [85.9, 26.4, 1],
  [94.5, 8.3, 1.3],
  [17.2, 41.7, 1],
  [81.3, 44.4, 1.2],
  [53.1, 31.9, 0.9],
];

export function NightStars() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-50">
      {STARS.map(([cx, cy, r], i) => (
        <circle key={i} cx={`${cx}%`} cy={`${cy}%`} r={r} fill="var(--color-parchment)" />
      ))}
    </svg>
  );
}

export function GameTitle() {
  return (
    <h1
      className="relative font-display text-7xl font-bold text-parchment"
      style={{ letterSpacing: "0.02em", textShadow: "0 2px 24px rgba(0,0,0,0.4)" }}
    >
      Patronage
    </h1>
  );
}
