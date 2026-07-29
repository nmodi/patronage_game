import { useMemo } from "react";
import { Gem, Medal, Mountain, Palette, TreePine, type LucideIcon } from "lucide-react";

import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { computePlazaConnectivity, connectionBonusOf } from "~/game/connectivity";
import { MATERIAL_STORAGE_BASE } from "~/game/constants";
import { MATERIALS, materialCaps } from "~/game/materials";
import { trafficFactor } from "~/game/traffic";
import type { Material } from "~/game/types";
import { staffingEfficiency } from "~/game/workers";
import { useGameStore } from "~/stores/useGameStore";
import { capitalizeLabel } from "./format";

// ponytail: placeholder glyphs until materials get bespoke art.
const MATERIAL_ICONS: Record<Material, LucideIcon> = {
  pigment: Palette,
  marble: Gem,
  bronze: Medal,
  timber: TreePine,
  stone: Mountain,
};

/**
 * Material stock, docked flush to the left screen edge as its own rail —
 * deliberately not a top-bar chip: materials are a cost paid when accepting a
 * commission, not a headline resource (design principle 8). Hidden until the
 * city has stock or storage beyond the base yard, so a fresh city isn't
 * fronted with zeroes.
 */
export function MaterialsPanel() {
  const materials = useGameStore((s) => s.materials);
  const tiles = useGameStore((s) => s.map.tiles);
  const population = useGameStore((s) => s.population);
  const caps = useMemo(() => materialCaps(tiles), [tiles]);

  // Mirror of the tick's supplier loop (rate × staffing × plazaBoost) using
  // last-tick worker counts, same as the building tooltip does.
  const rates = useMemo(() => {
    const connected = computePlazaConnectivity(tiles);
    const rates = Object.fromEntries(MATERIALS.map((m) => [m, 0])) as Record<Material, number>;
    for (const [key, tile] of Object.entries(tiles)) {
      if (!tile.isOrigin || !tile.isActive) continue;
      const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
      if (!metadata?.supplies) continue;
      const staffing = staffingEfficiency(
        metadata.workersRequired ?? 0,
        metadata.maxWorkers ?? 0,
        tile.workers
      );
      const boost =
        1 +
        connectionBonusOf(metadata) *
          (connected.get(key) ?? 0) *
          trafficFactor(metadata, key, tiles, population);
      rates[metadata.supplies.material] += metadata.supplies.rate * staffing * boost;
    }
    return rates;
  }, [tiles, population]);

  // A cap above the base yard means a supplier or warehouse stands.
  const built = MATERIALS.some((m) => caps[m] > MATERIAL_STORAGE_BASE);
  if (!built && !MATERIALS.some((m) => materials[m] > 0)) return null;

  // Slim unfurl rail: icons + held counts at rest; hovering unfurls each row
  // sideways to reveal name, held/cap, and rate — the .hud-toggle grid-track
  // reveal grammar (see app.css .mat-rail).
  return (
    <div
      data-hud="true"
      className="mat-rail panel-parchment pointer-events-auto rounded-r-lg text-ink"
    >
      {MATERIALS.map((material) => {
        const Icon = MATERIAL_ICONS[material];
        const held = Math.floor(materials[material]);
        const rate = rates[material];
        const rateLabel = `+${Number.isInteger(rate) ? rate : rate.toFixed(1)}`;
        return (
          <div key={material} className="mat-row">
            <span className="mat-cell">
              <Icon className="h-4 w-4 text-sienna" strokeWidth={1.75} />
              <span className="mat-held">{held}</span>
            </span>
            <span className="mat-detail">
              <span className="mat-detail-inner">
                <span className="mat-name">{capitalizeLabel(material)}</span>
                <span className="mat-nums">
                  {held}
                  <span className="mat-cap"> / {caps[material]}</span>
                  <span className="mat-rate">{rateLabel}/mo</span>
                </span>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
