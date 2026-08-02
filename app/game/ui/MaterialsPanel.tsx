import { useMemo } from "react";

import { origins } from "~/game/buildings";
import { computePlazaConnectivity } from "~/game/city/connectivity";
import { MATERIAL_STORAGE_BASE } from "~/game/constants";
import { MATERIALS, materialCaps } from "~/game/art/materials";
import { supplierRate } from "~/game/city/metrics";
import type { Material } from "~/game/types";
import { useGameStore } from "~/stores/useGameStore";
import { MATERIAL_ICONS } from "./buildingIcons";
import { capitalizeLabel, formatAmount } from "./format";

/**
 * Material stock, docked flush to the left screen edge as its own rail —
 * deliberately not a top-bar chip: materials are a cost paid when accepting a
 * commission, not a headline resource (design principle 8). Hidden until the
 * city has stock or storage beyond the base yard, so a fresh city isn't
 * fronted with zeroes.
 */
/**
 * True once the city has stock or storage beyond the base yard — the rail's
 * own show/hide condition, shared so left flyouts can clear the rail's width.
 */
export function useMaterialsRailVisible(): boolean {
  const materials = useGameStore((s) => s.materials);
  const tiles = useGameStore((s) => s.map.tiles);
  return useMemo(() => {
    const caps = materialCaps(tiles);
    return MATERIALS.some((m) => caps[m] > MATERIAL_STORAGE_BASE || materials[m] > 0);
  }, [materials, tiles]);
}

export function MaterialsPanel() {
  const materials = useGameStore((s) => s.materials);
  const tiles = useGameStore((s) => s.map.tiles);
  const population = useGameStore((s) => s.population);
  const visible = useMaterialsRailVisible();
  const caps = useMemo(() => materialCaps(tiles), [tiles]);

  // The tick's own supplier math (supplierRate), off last-tick worker counts —
  // same as the building tooltip.
  const rates = useMemo(() => {
    const connected = computePlazaConnectivity(tiles);
    const rates = Object.fromEntries(MATERIALS.map((m) => [m, 0])) as Record<Material, number>;
    for (const [key, tile, metadata] of origins(tiles)) {
      if (!tile.isActive || !metadata.supplies) continue;
      rates[metadata.supplies.material] += supplierRate(
        metadata,
        tile.workers,
        key,
        connected.get(key) ?? 0,
        tiles,
        population
      );
    }
    return rates;
  }, [tiles, population]);

  if (!visible) return null;

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
        const rateLabel = `+${formatAmount(rate)}`;
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
