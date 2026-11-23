/** Five-stop color ramps, from "empty dish" (stop 0) to "dense growth" (stop 4). */
export interface Palette {
  id: string;
  stops: readonly [string, string, string, string, string];
}

export const PALETTES: readonly Palette[] = [
  { id: "abyss", stops: ["#04060c", "#0b2a3c", "#1f8a8a", "#9fe7d0", "#ffffff"] },
  { id: "ember", stops: ["#0a0302", "#3d0c02", "#c2410c", "#fbbf24", "#fff7e0"] },
  { id: "orchid", stops: ["#07030f", "#2e1065", "#a21caf", "#f0abfc", "#fdf4ff"] },
  { id: "toxic", stops: ["#020702", "#0f2e12", "#3f9b0b", "#c6f432", "#f7ffe0"] },
  { id: "ice", stops: ["#f5f9ff", "#cfe3ff", "#6aa8ff", "#1d4ed8", "#0b1640"] },
  { id: "paper", stops: ["#f4efe4", "#e6dcc6", "#a08c6c", "#3b3127", "#141010"] },
  { id: "sunset", stops: ["#120318", "#5b1a4a", "#e2445c", "#ffa45b", "#ffe8a3"] },
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
