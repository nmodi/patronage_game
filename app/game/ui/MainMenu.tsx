import { useEffect, useState, type ReactNode } from "react";
import { Music, Users, Volume2 } from "lucide-react";

import { seedForArchetype } from "~/game/map/seed";
import { ARCHETYPE_LABELS, type WaterArchetype } from "~/game/map/water";
import { formatMonth, useGameStore } from "~/stores/useGameStore";
import { CloseButton, ModalBackdrop, Panel } from "./Panel";
import { GameTitle, NIGHT_SKY_BG } from "./nightSky";
import { CreditsBody, VolumeRow } from "./SettingsMenu";

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
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [seedDraft, setSeedDraft] = useState("");
  const [archetype, setArchetype] = useState<WaterArchetype | "random">("random");
  const [modal, setModal] = useState<"settings" | "credits" | null>(null);
  useEffect(() => {
    const peeked = peekSave();
    setSave(peeked);
    // Hydrate now, not on Continue: the Settings modal writes volumes through
    // the persist layer, and any set() on an unhydrated store would overwrite
    // the save with initial state.
    if (peeked) useGameStore.persist.rehydrate();
  }, []);

  const startNewGame = () => {
    // Two-click confirm in place of window.confirm — the guard stays, the
    // native dialog breaking the parchment world goes.
    if (save && !confirmOverwrite) {
      setConfirmOverwrite(true);
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
      className="relative flex h-screen w-full flex-col items-center justify-center gap-6"
      style={{ background: NIGHT_SKY_BG }}
    >
      <BlueprintPlates />
      <div className="relative flex flex-col items-center gap-4">
        <GameTitle />
        <TitleDivider />
      </div>
      <Panel frameClassName="relative rounded-lg" className="flex w-80 flex-col gap-2">
        {save && (
          <MenuButton primary onClick={onStart}>
            Continue
            <span className="block text-xs font-normal opacity-80">
              {save.cityName}, {formatMonth(save.tickCount)}
            </span>
          </MenuButton>
        )}
        <MenuButton
          primary={!save}
          onClick={() => {
            setNewGameOpen((open) => !open);
            setConfirmOverwrite(false);
          }}
        >
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
              {confirmOverwrite ? `Overwrite "${save?.cityName}"?` : "Found the City"}
            </MenuButton>
          </div>
        )}
        <CardDivider />
        <button
          className="text-center text-xs tracking-wide text-ink-faint underline-offset-2 transition hover:text-ink hover:underline"
          // ponytail: full reload — demo mode (storage + seed) is decided at store creation
          onClick={() => window.location.assign("?demo")}
        >
          New here? Tour the demo city
        </button>
        <div className="mt-1 flex items-center justify-center gap-3 border-t border-wood/50 pt-2.5 text-sm">
          <FooterLink onClick={() => setModal("settings")}>Settings</FooterLink>
          <span aria-hidden className="h-1 w-1 rotate-45 bg-wood" />
          <FooterLink onClick={() => setModal("credits")}>Credits</FooterLink>
        </div>
      </Panel>
      {modal && (
        <ModalBackdrop onDismiss={() => setModal(null)}>
          <div className="w-80" onClick={(e) => e.stopPropagation()}>
            <Panel
              header={
                <div className="flex items-center justify-between gap-2">
                  <span>{modal === "settings" ? "Settings" : "Credits"}</span>
                  <CloseButton
                    label={`Close ${modal}`}
                    onClick={() => setModal(null)}
                  />
                </div>
              }
              className="flex flex-col gap-2.5 text-sm"
            >
              {modal === "settings" ? <MenuAudioSettings /> : <CreditsBody />}
            </Panel>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

/** Volume sliders only — the in-game sections (now playing, restart, seed)
 * have no meaning before a city is on screen. */
function MenuAudioSettings() {
  const musicVolume = useGameStore((s) => s.musicVolume);
  const setMusicVolume = useGameStore((s) => s.setMusicVolume);
  const sfxVolume = useGameStore((s) => s.sfxVolume);
  const setSfxVolume = useGameStore((s) => s.setSfxVolume);
  const ambienceVolume = useGameStore((s) => s.ambienceVolume);
  const setAmbienceVolume = useGameStore((s) => s.setAmbienceVolume);
  // ponytail: with no save yet, the first slider write persists a fresh default
  // city, so Continue appears for a town never played. Harmless — it's exactly
  // the save New Game would write — but a "settings live outside the save"
  // split is the fix if it ever grates.
  return (
    <>
      <VolumeRow icon={Music} label="Music" value={musicVolume} onChange={setMusicVolume} />
      <VolumeRow icon={Users} label="Ambience" value={ambienceVolume} onChange={setAmbienceVolume} />
      <VolumeRow icon={Volume2} label="Sound Effects" value={sfxVolume} onChange={setSfxVolume} />
    </>
  );
}

/** Gold rule — open diamond — rule, the mockup's flourish under the title. */
function TitleDivider() {
  return (
    <div aria-hidden className="flex w-72 items-center gap-2.5 text-prestige-gold/90">
      <span className="h-px flex-1 bg-current opacity-70" />
      <span className="h-2 w-2 rotate-45 border border-current" />
      <span className="h-px flex-1 bg-current opacity-70" />
    </div>
  );
}

/** Small filled diamond separating card sections. */
function CardDivider() {
  return (
    <div aria-hidden className="my-0.5 flex justify-center">
      <span className="h-1.5 w-1.5 rotate-45 bg-wood" />
    </div>
  );
}

function FooterLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      className="px-1 text-ink-faint transition hover:text-ink"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Traced Palladio plates (scripts/make-menu-plates.py) as faint blueprint
 * linework behind the menu — the tint is baked into the SVGs, opacity here. */
function BlueprintPlates() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.16]">
      <img
        src="/menu/palladio-temple.svg"
        alt=""
        className="absolute left-[-3vw] top-1/2 w-[24vw] -translate-y-1/2"
      />
      <img
        src="/menu/palladio-rotonda.svg"
        alt=""
        className="absolute right-[-2vw] top-[14%] w-[30vw]"
      />
      <img
        src="/menu/palladio-plan-square.svg"
        alt=""
        className="absolute bottom-[-9vw] left-[-5vw] w-[26vw]"
      />
      <img
        src="/menu/palladio-plan-round.svg"
        alt=""
        className="absolute bottom-[-12vw] right-[6vw] w-[18vw]"
      />
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
      className={`px-4 py-2.5 ${primary ? "btn-primary" : "btn-secondary"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
