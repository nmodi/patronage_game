/** Night-sky backdrop (DS `--surface-night`) shared by the main menu and the loading screens. */
export const NIGHT_SKY_BG =
  "radial-gradient(circle at 50% 30%, var(--color-crest-blue) 0%, var(--color-crest-blue-deep) 55%, #111731 100%)";

// The three Palladio plates of the drawing set: elevation / plan / elevation,
// with Palazzo Iseppo Porto contributing both its facade and its floor plan.
const SHEET_ROWS = ["facade-thiene", "plan-porto", "facade-porto"] as const;
// Row height = plate aspect at the 480px tile width (.survey-drift's loop length).
const ROW_HEIGHT: Record<(typeof SHEET_ROWS)[number], number> = {
  "facade-thiene": 208,
  "plan-porto": 252,
  "facade-porto": 210,
};

/**
 * The traced-plate drawing set behind the menu and loading screens: near-flush
 * rows of elevation / plan / elevation on a 12° bias, half-dropped, drifting
 * one tile per pass (`.survey-drift` in app.css; static under reduced motion).
 * Oversized margins keep the rotated, drifting sheet covering up to 4K.
 */
export function DraftingSheet() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="survey-drift absolute flex flex-col justify-center gap-2.5 opacity-30"
        style={{ left: -700, right: -700, top: -400, bottom: -400 }}
      >
        {Array.from({ length: 15 }, (_, i) => {
          const file = SHEET_ROWS[i % 3];
          return (
            <div
              key={i}
              className="shrink-0"
              style={{
                height: ROW_HEIGHT[file],
                backgroundImage: `url(/menu/palladio-${file}.svg)`,
                // Exactly one 480px tile per repeat so the drift loop is seamless
                // (true aspect is within 0.3% — the pin beats the purity).
                backgroundSize: "480px 100%",
                backgroundPositionX: i % 2 ? 240 : 0,
              }}
            />
          );
        })}
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 52%, rgba(27,35,64,0.55), transparent 70%)",
        }}
      />
    </div>
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
