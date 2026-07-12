import { mulberry32 } from "~/game/random";

// Sun-dried earth with a darker packed rim at the grass edge.
const DIRT_BASE = "#c9a172";
const DIRT_TONES = ["#b98f60", "#d4ad7e", "#bd9464", "#8f6f4e"];

export const DIRT_EDGE = "#ab8a6c";

/** Draw a seamlessly tiling packed-earth texture into a square canvas. */
export function drawDirtTexture(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: string = DIRT_BASE,
  tones: string[] = DIRT_TONES
) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(1509);
  for (let i = 0; i < 60; i += 1) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rx = size * (0.04 + rand() * 0.12);
    const ry = rx * (0.4 + rand() * 0.6);
    const angle = rand() * Math.PI;
    ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
    ctx.globalAlpha = 0.15 + rand() * 0.25;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.ellipse(cx + dx, cy + dy, rx, ry, angle, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}
