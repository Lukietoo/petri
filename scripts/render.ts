/**
 * Headless renderer: runs the CPU simulation and writes a PNG.
 *
 *   npm run render -- --preset coral --palette ember --size 640x400 --steps 6000 --out coral.png
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { GrayScott } from "../src/core/grayscott";
import { PALETTES, paletteById, sampleRamp } from "../src/core/palettes";
import { PRESETS, presetById } from "../src/core/presets";
import { SEED_KINDS, makeSeed, type SeedKind } from "../src/core/seeds";
import { encodePNG } from "./png";

const { values: args } = parseArgs({
  options: {
    preset: { type: "string", default: "coral" },
    palette: { type: "string", default: "abyss" },
    seed: { type: "string", default: "spots" },
    "seed-value": { type: "string", default: String((Math.random() * 1e6) | 0) },
    size: { type: "string", default: "480x300" },
    scale: { type: "string", default: "2" },
    steps: { type: "string", default: "5000" },
    feed: { type: "string" },
    kill: { type: "string" },
    shade: { type: "string", default: "0.6" },
    out: { type: "string", default: "petri.png" },
    help: { type: "boolean", short: "h" },
  },
});

if (args.help) {
  console.log(`petri render

  --preset   ${PRESETS.map((p) => p.id).join(" | ")}
  --palette  ${PALETTES.map((p) => p.id).join(" | ")}
  --seed     ${SEED_KINDS.join(" | ")}
  --seed-value <int>   deterministic seed
  --size WxH           simulation grid (default 480x300)
  --scale N            output pixels per cell (default 2)
  --steps N            iterations (default 5000)
  --feed / --kill      override the preset
  --shade 0..1         emboss strength
  --out file.png`);
  process.exit(0);
}

const preset = presetById(args.preset!);
if (!preset) throw new Error(`unknown preset ${args.preset}`);
const palette = paletteById(args.palette!);
if (!palette) throw new Error(`unknown palette ${args.palette}`);
if (!(SEED_KINDS as readonly string[]).includes(args.seed!)) throw new Error(`unknown seed ${args.seed}`);

const [w, h] = args.size!.split("x").map(Number);
const scale = Math.max(1, Number(args.scale) | 0);
const steps = Number(args.steps);
const shade = Number(args.shade);
const feed = args.feed ? Number(args.feed) : preset.feed;
const kill = args.kill ? Number(args.kill) : preset.kill;

const t0 = performance.now();
const sim = new GrayScott(w, h, makeSeed(args.seed as SeedKind, w, h, Number(args["seed-value"])));
const chunkSize = 250;
for (let done = 0; done < steps; done += chunkSize) {
  sim.step({ feed, kill }, Math.min(chunkSize, steps - done));
  process.stdout.write(`\r  simulating ${Math.min(steps, done + chunkSize)}/${steps}`);
}
process.stdout.write("\n");

// ---- shade: same mapping as the display shader, bilinear-upscaled ----
const A = sim.A;
const B = sim.B;
const W = w * scale;
const H = h * scale;
const cell = (cx: number, cy: number) => {
  const i = (((cy % h) + h) % h) * w + (((cx % w) + w) % w);
  return Math.min(1, Math.max(0, (B[i] - A[i]) * 0.5 + 0.5));
};
const bspline = (t: number): [number, number, number, number] => {
  const t2 = t * t;
  const t3 = t2 * t;
  return [(1 - 3 * t + 3 * t2 - t3) / 6, (4 - 6 * t2 + 3 * t3) / 6, (1 + 3 * t + 3 * t2 - 3 * t3) / 6, t3 / 6];
};
// cubic B-spline sample of (B - A) * 0.5 + 0.5 in cell space, same filter as the shader
const field = (x: number, y: number) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const wx = bspline(x - x0);
  const wy = bspline(y - y0);
  let sum = 0;
  for (let j = 0; j < 4; j++) {
    let row = 0;
    for (let i = 0; i < 4; i++) row += wx[i] * cell(x0 - 1 + i, y0 - 1 + j);
    sum += wy[j] * row;
  }
  return sum;
};
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const L = [-0.5, -0.6, 0.65];
const ln = Math.hypot(...L);
const EDGE = 0.22;
const bg = sampleRamp(palette, 0);
const rgb = new Uint8Array(W * H * 3);
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const x = (px + 0.5) / scale - 0.5;
    const y = (py + 0.5) / scale - 0.5;
    const val = field(x, y);

    // anti-aliased edge ~1 output pixel wide (CPU stand-in for fwidth)
    const fw = Math.abs(field(x + 1 / scale, y) - val) + Math.abs(field(x, y + 1 / scale) - val);
    const aa = Math.max(fw, 1e-4);
    const cover = smooth(EDGE - aa, EDGE + aa, val);

    const depth = smooth(EDGE, EDGE + 0.2, val);
    let [r, g, b] = sampleRamp(palette, 0.9 + 0.1 * depth);
    const dx = field(x + 1, y) - field(x - 1, y);
    const dy = field(x, y + 1) - field(x, y - 1);
    const nx = -dx * 4;
    const ny = -dy * 4;
    const nl = Math.hypot(nx, ny, 1);
    const light = (nx * L[0] + ny * L[1] + L[2]) / (nl * ln);
    const k = 1 + shade * (Math.min(1.1, Math.max(0.75, 0.8 + 0.3 * light)) - 1);
    r *= k;
    g *= k;
    b *= k;

    const near = smooth(EDGE * 0.85, EDGE, val);
    const ok = 1 - 0.12 * near * shade;
    const vig = 1 - 0.2 * smooth(0.35, 0.85, Math.hypot(px / W - 0.5, (py / H - 0.5) * 0.85));
    const o = (py * W + px) * 3;
    const out = [bg[0] * ok + (r - bg[0] * ok) * cover, bg[1] * ok + (g - bg[1] * ok) * cover, bg[2] * ok + (b - bg[2] * ok) * cover];
    for (let c = 0; c < 3; c++) rgb[o + c] = Math.round(Math.min(1, Math.max(0, out[c] * vig)) * 255);
  }
}

writeFileSync(args.out!, encodePNG(W, H, rgb));
console.log(`  ✓ ${args.out}  ${W}×${H}  ${preset.id} / ${palette.id}  ${((performance.now() - t0) / 1000).toFixed(1)}s`);
