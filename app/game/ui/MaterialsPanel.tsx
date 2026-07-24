import { useMemo } from "react";

import { MATERIAL_STORAGE_BASE } from "~/game/constants";
import { MATERIALS, materialCaps } from "~/game/materials";
import { useGameStore } from "~/stores/useGameStore";
import { Panel } from "./Panel";
import { capitalizeLabel } from "./format";

/**
 * Material stock, stacked under the patron crests in the right-hand rail:
 * who's asking above, what you can answer with below. Deliberately not a
 * top-bar chip — materials are a cost paid when accepting a commission, not a
 * headline resource (design principle 8). Hidden until the city has stock or
 * storage beyond the base yard, so a fresh city isn't fronted with zeroes.
 */
export function MaterialsPanel() {
  const materials = useGameStore((s) => s.materials);
  const tiles = useGameStore((s) => s.map.tiles);
  const caps = useMemo(() => materialCaps(tiles), [tiles]);

  // A cap above the base yard means a supplier or warehouse stands.
  const built = MATERIALS.some((m) => caps[m] > MATERIAL_STORAGE_BASE);
  if (!built && !MATERIALS.some((m) => materials[m] > 0)) return null;

  // w-60 matches FactionCard so the rail reads as one column, not two.
  return (
    <Panel header="Stores" className="flex w-60 flex-col gap-1.5 text-sm">
      {MATERIALS.map((material) => {
        const held = Math.floor(materials[material]);
        return (
          <div key={material} className="flex items-baseline justify-between gap-4">
            <span className="text-ink-faint">{capitalizeLabel(material)}</span>
            <span className="font-semibold text-ink tabular-nums">
              {held}
              <span className="font-normal text-ink-faint"> / {caps[material]}</span>
            </span>
          </div>
        );
      })}
    </Panel>
  );
}
