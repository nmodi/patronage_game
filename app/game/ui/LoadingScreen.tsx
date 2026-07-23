import { GameTitle, NIGHT_SKY_BG, NightStars } from "./nightSky";

/**
 * Full-screen boot backdrop shown while the city loads (fonts, the Babylon
 * scene, the seeded world). Shares the main menu's night sky so the boot →
 * menu → game hand-off reads as one continuous surface. Presentational: the
 * caller decides when to mount and unmount it.
 */
export function LoadingScreen({ message = "Preparing the city…" }: { message?: string }) {
  return (
    <div
      className="relative flex h-screen w-full flex-col items-center justify-center gap-8"
      style={{ background: NIGHT_SKY_BG }}
    >
      <NightStars />
      <GameTitle />
      <div className="relative flex flex-col items-center gap-3">
        <LoadingDots />
        <span className="font-display text-sm italic tracking-wide text-parchment/70">
          {message}
        </span>
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-pulse rounded-full bg-parchment/80"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  );
}
