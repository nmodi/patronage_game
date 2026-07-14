import { useEffect, useState, type ReactNode } from "react";

import { seedForArchetype } from "~/game/seed";
import type { WaterArchetype } from "~/game/water";
import { formatMonth, useGameStore } from "~/stores/useGameStore";
import { ARCHETYPE_LABELS } from "./TopBar";
import { Panel } from "./Panel";

interface SavePeek {
  cityName: string;
  tickCount: number;
}

/** Peek at the persisted save without hydrating the store — drives Continue. */
function peekSave(): SavePeek | null {
  try {
    const raw = localStorage.getItem("patronage-save");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if ((parsed.version ?? 0) < 5) return null; // migrateSave discards these
    return {
      cityName: parsed.state.cityName,
      tickCount: parsed.state.time?.tickCount ?? 0,
    };
  } catch {
    return null; // unreadable save — hide Continue
  }
}

export function MainMenu({ onStart }: { onStart: () => void }) {
  const [save, setSave] = useState<SavePeek | null>(null);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [seedDraft, setSeedDraft] = useState("");
  const [archetype, setArchetype] = useState<WaterArchetype | "random">("random");
  useEffect(() => setSave(peekSave()), []);

  const continueGame = () => {
    useGameStore.persist.rehydrate();
    onStart();
  };

  const startNewGame = () => {
    if (save && !window.confirm(`Start a new city? "${save.cityName}" will be overwritten.`)) {
      return;
    }
    // Seeds are stored lowercase — the UI shows them uppercase (TopBar copySeed).
    const typed = seedDraft.trim().toLowerCase();
    const seed =
      typed || (archetype === "random" ? undefined : seedForArchetype(archetype));
    useGameStore.getState().resetGame(seed);
    onStart();
  };

  return (
    <div
      className="flex h-screen w-full flex-col items-center justify-center gap-8"
      style={{
        background:
          "radial-gradient(circle at 50% 35%, var(--color-parchment) 0%, var(--color-parchment-deep) 60%, #ddc9a1 100%)",
      }}
    >
      <div className="text-center">
        <h1 className="font-display text-6xl font-bold tracking-wide text-ink">Patronage</h1>
        <p className="mt-3 font-display text-lg italic text-ink-faint">
          A cozy city of art, in the Italian Renaissance
        </p>
      </div>
      <Panel className="flex w-80 flex-col gap-2">
        {save && (
          <MenuButton primary onClick={continueGame}>
            Continue
            <span className="block text-xs font-normal opacity-80">
              {save.cityName}, {formatMonth(save.tickCount)}
            </span>
          </MenuButton>
        )}
        <MenuButton primary={!save} onClick={() => setNewGameOpen((open) => !open)}>
          New Game
        </MenuButton>
        {newGameOpen && (
          <div className="flex flex-col gap-2 rounded-lg bg-parchment-deep/60 p-3">
            <input
              value={seedDraft}
              onChange={(e) => setSeedDraft(e.target.value)}
              placeholder="Seed (optional)"
              maxLength={16}
              className="rounded border border-wood/50 bg-parchment px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-sienna"
            />
            {seedDraft.trim() ? (
              <p className="text-xs italic text-ink-faint">The seed decides the map.</p>
            ) : (
              <label className="flex items-center justify-between gap-2 text-xs text-ink-faint">
                Map
                <select
                  value={archetype}
                  onChange={(e) => setArchetype(e.target.value as WaterArchetype | "random")}
                  className="rounded border border-wood/50 bg-parchment px-2 py-1.5 text-sm text-ink outline-none focus:border-sienna"
                >
                  <option value="random">Random</option>
                  {Object.entries(ARCHETYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <MenuButton primary onClick={startNewGame}>
              Found the City
            </MenuButton>
          </div>
        )}
        <button
          className="mt-1 text-center text-xs tracking-wide text-ink-faint underline-offset-2 transition hover:text-ink hover:underline"
          // ponytail: full reload — demo mode (storage + seed) is decided at store creation
          onClick={() => window.location.assign("?demo")}
        >
          New here? Tour the demo city
        </button>
      </Panel>
    </div>
  );
}

function MenuButton({
  primary,
  onClick,
  children,
}: {
  primary?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`rounded-lg px-4 py-2.5 font-semibold transition ${
        primary
          ? "bg-sienna text-parchment hover:bg-sienna/85"
          : "bg-parchment-deep text-ink hover:bg-wood/40"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
