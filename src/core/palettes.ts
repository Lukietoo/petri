/** Five-stop color ramps, from "empty dish" (stop 0) to "dense growth" (stop 4). */
export interface Palette {
  id: string;
  stops: readonly [string, string, string, string, string];
}

// Low-contrast by design: backgrounds are tinted rather than black and the brightest
// stop stays well short of white, so dense patterns don't strobe or glare.
export const PALETTES: readonly Palette[] = [
  { id: "abyss", stops: ["#0d1a24", "#12303d", "#2a6b70", "#6fb3a6", "#bfe3d4"] },
  { id: "ember", stops: ["#1a0f0c", "#3a1a12", "#9a4a26", "#d98d4a", "#f0c89a"] },
  { id: "orchid", stops: ["#150f22", "#2c1b47", "#6b3b8c", "#b27fc6", "#e5c9ee"] },
  { id: "toxic", stops: ["#0f1610", "#1d3320", "#4a7a3c", "#95b866", "#d9e8b0"] },
  { id: "ice", stops: ["#e9eef5", "#cdd9ea", "#8fa9cf", "#4f6fa6", "#2a3f6b"] },
  { id: "paper", stops: ["#efe8da", "#ddd1bb", "#b09c7c", "#6e5c47", "#3d3229"] },
  { id: "sunset", stops: ["#1c1020", "#3d1b38", "#8f3f57", "#d9826a", "#f4c9a0"] },
];

export function paletteById(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id);
}

/** Parse "#rrggbb" or "#rgb" into [r, g, b] in 0..1. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`invalid hex color: ${hex}`);
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Flatten a palette into the 15-float layout the display shader expects. */
export function paletteUniform(p: Palette): Float32Array {
  const out = new Float32Array(15);
  p.stops.forEach((s, i) => out.set(hexToRgb(s), i * 3));
  return out;
}

/** Sample the ramp at t in 0..1 (same math as the shader). */
export function sampleRamp(p: Palette, t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * 4;
  const i = Math.min(3, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(p.stops[i]);
  const b = hexToRgb(p.stops[i + 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
