import { Sim, type Brush } from "./gl/sim";
import { PALETTES, paletteById, paletteUniform } from "./core/palettes";
import { PRESETS, presetById } from "./core/presets";
import { makeSeed, type SeedKind } from "./core/seeds";

export interface AppState {
  feed: number;
  kill: number;
  palette: string;
  seedKind: SeedKind;
  seed: number;
  speed: number; // simulation iterations per frame
  brush: number; // brush radius in px
  resolution: number; // sim cells per CSS pixel
  shade: number;
  map: boolean;
}

export const DEFAULTS: AppState = {
  feed: 0.0545,
  kill: 0.062,
  palette: "abyss",
  seedKind: "spots",
  seed: 1,
  speed: 14,
  brush: 18,
  resolution: 0.5,
  shade: 0.8,
  map: false,
};

export class App {
  readonly sim: Sim;
  state: AppState;
  paused = false;
  private stops: Float32Array;
  private brush: Brush = { x: 0, y: 0, radius: 0, mode: 0 };
  private pointerDown = false;
  private erase = false;
  private listeners: Array<(s: AppState) => void> = [];

  constructor(readonly canvas: HTMLCanvasElement, initial: Partial<AppState> = {}) {
    this.sim = new Sim(canvas);
    this.state = { ...DEFAULTS, seed: (Math.random() * 1e6) | 0, ...initial };
    this.stops = paletteUniform(paletteById(this.state.palette) ?? PALETTES[0]);
    this.bindPointer();
    this.resize(true);

    let t: number | undefined;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = window.setTimeout(() => this.resize(false), 200);
    });
  }

  onChange(fn: (s: AppState) => void) {
    this.listeners.push(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  set(patch: Partial<AppState>) {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    if (patch.palette && patch.palette !== prev.palette) {
      this.stops = paletteUniform(paletteById(patch.palette) ?? PALETTES[0]);
    }
    if (patch.resolution !== undefined && patch.resolution !== prev.resolution) this.resize(true);
    this.emit();
  }

  applyPreset(id: string) {
    const p = presetById(id);
    if (p) this.set({ feed: p.feed, kill: p.kill, map: false });
  }

  /** Clear the dish and plant a fresh initial condition. */
  reseed(kind = this.state.seedKind, seed = (Math.random() * 1e6) | 0) {
    this.state = { ...this.state, seedKind: kind, seed };
    this.sim.reset(this.sim.width, this.sim.height, makeSeed(kind, this.sim.width, this.sim.height, seed));
    this.emit();
  }

  /** Seed the dish from rendered text (B where the glyphs are). */
  seedText(text: string) {
    const { width: w, height: h } = this.sim;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    // Outlines grow into crisper letterforms than solid fills, which tend to
    // starve in their interiors and collapse.
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, h / 120);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = h * 0.4;
    ctx.font = `800 ${size}px "Space Grotesk", system-ui, sans-serif`;
    const mw = ctx.measureText(text).width;
    if (mw > w * 0.85) size *= (w * 0.85) / mw;
    ctx.font = `800 ${size}px "Space Grotesk", system-ui, sans-serif`;
    ctx.strokeText(text, w / 2, h / 2);
    const px = ctx.getImageData(0, 0, w, h).data;
    const grid = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // flip y: canvas rows go down, texture rows go up
        const i = ((h - 1 - y) * w + x) * 4;
        const on = px[(y * w + x) * 4] > 128;
        grid[i] = on ? 0.5 : 1;
        grid[i + 1] = on ? 1 : 0;
        grid[i + 3] = 1;
      }
    }
    this.sim.reset(w, h, grid);
  }

  private resize(force: boolean) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(window.innerWidth * dpr));
    const ch = Math.max(1, Math.round(window.innerHeight * dpr));
    this.canvas.width = cw;
    this.canvas.height = ch;
    const sw = Math.max(16, Math.round(window.innerWidth * this.state.resolution));
    const sh = Math.max(16, Math.round(window.innerHeight * this.state.resolution));
    if (force || Math.abs(sw - this.sim.width) > 4 || Math.abs(sh - this.sim.height) > 4) {
      this.sim.reset(sw, sh, makeSeed(this.state.seedKind, sw, sh, this.state.seed));
    }
  }

  private bindPointer() {
    const c = this.canvas;
    const move = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      this.brush.x = (e.clientX - r.left) / r.width;
      this.brush.y = 1 - (e.clientY - r.top) / r.height;
    };
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerdown", (e) => {
      this.pointerDown = true;
      this.erase = e.button === 2 || e.shiftKey;
      c.setPointerCapture(e.pointerId);
      move(e);
    });
    c.addEventListener("pointermove", move);
    const up = () => (this.pointerDown = false);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
  }

  frame() {
    const s = this.state;
    const r = c01(s.brush / Math.max(1, window.innerHeight));
    this.brush.radius = r;
    this.brush.mode = this.pointerDown ? (this.erase ? -1 : 1) : 0;
    if (!this.paused) {
      this.sim.step({ feed: s.feed, kill: s.kill, diffA: 1, diffB: 0.5, dt: 1, map: s.map }, this.brush, s.speed);
    } else if (this.brush.mode !== 0) {
      this.sim.step({ feed: s.feed, kill: s.kill, diffA: 1, diffB: 0.5, dt: 1, map: s.map }, this.brush, 1);
    }
    this.sim.draw(this.stops, s.shade);
  }
}

function c01(v: number) {
  return Math.min(1, Math.max(0, v));
}

// ---------- boot ----------
const canvas = document.getElementById("stage") as HTMLCanvasElement;
const app = new App(canvas);

window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= PRESETS.length) app.applyPreset(PRESETS[n - 1].id);
  if (e.key === " ") {
    e.preventDefault();
    app.paused = !app.paused;
  }
  if (e.key === "r") app.reseed();
});

function loop() {
  app.frame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) (window as unknown as { petri: App }).petri = app;
