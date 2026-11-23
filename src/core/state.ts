import { paletteById } from "./palettes";
import { SEED_KINDS, type SeedKind } from "./seeds";

export interface AppState {
  feed: number;
  kill: number;
  palette: string;
  seedKind: SeedKind;
  seed: number;
  speed: number; // simulation iterations per frame
  brush: number; // brush radius in CSS px
  resolution: number; // sim cells per CSS pixel
  shade: number; // 0..1 emboss strength
  map: boolean; // show the feed/kill parameter map
}

export const DEFAULTS: AppState = {
  feed: 0.0545,
  kill: 0.062,
  palette: "abyss",
  seedKind: "spots",
  seed: 1,
  speed: 14,
  brush: 18,
  resolution: 0.35,
  shade: 0.6,
  map: false,
};

/** Parameter ranges shown in map mode: feed runs bottom→top, kill runs left→right. */
export const MAP_RANGE = {
  feed: [0.01, 0.09] as const,
  kill: [0.045, 0.07] as const,
};

/** Convert a uv position (0..1, y up) in map mode into the (feed, kill) under it. */
export function mapToParams(u: number, v: number): { feed: number; kill: number } {
  const cu = Math.min(1, Math.max(0, u));
  const cv = Math.min(1, Math.max(0, v));
  return {
    feed: MAP_RANGE.feed[0] + (MAP_RANGE.feed[1] - MAP_RANGE.feed[0]) * cv,
    kill: MAP_RANGE.kill[0] + (MAP_RANGE.kill[1] - MAP_RANGE.kill[0]) * cu,
  };
}

const LIMITS: Record<string, [number, number]> = {
  feed: [0, 0.12],
  kill: [0, 0.08],
  speed: [1, 40],
  brush: [2, 120],
  resolution: [0.2, 1],
  shade: [0, 1],
};

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const round = (v: number, dp: number) => Number(v.toFixed(dp));

/** Serialize the shareable parts of the state into a compact hash string. */
export function encodeState(s: AppState): string {
  const p = new URLSearchParams();
  p.set("f", String(round(s.feed, 5)));
  p.set("k", String(round(s.kill, 5)));
  p.set("c", s.palette);
  p.set("s", `${s.seedKind}.${s.seed}`);
  if (s.speed !== DEFAULTS.speed) p.set("v", String(s.speed));
  if (s.shade !== DEFAULTS.shade) p.set("sh", String(round(s.shade, 2)));
  if (s.resolution !== DEFAULTS.resolution) p.set("r", String(s.resolution));
  return p.toString();
}

/** Parse a hash string back into a partial state, ignoring anything invalid. */
export function decodeState(hash: string): Partial<AppState> {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const out: Partial<AppState> = {};
  const num = (key: string, field: keyof typeof LIMITS) => {
    const raw = p.get(key);
    if (raw === null) return undefined;
    const v = Number(raw);
    return Number.isFinite(v) ? clamp(v, LIMITS[field]) : undefined;
  };

  const f = num("f", "feed");
  if (f !== undefined) out.feed = f;
  const k = num("k", "kill");
  if (k !== undefined) out.kill = k;
  const v = num("v", "speed");
  if (v !== undefined) out.speed = Math.round(v);
  const sh = num("sh", "shade");
  if (sh !== undefined) out.shade = sh;
  const r = num("r", "resolution");
  if (r !== undefined) out.resolution = r;

  const c = p.get("c");
  if (c && paletteById(c)) out.palette = c;

  const s = p.get("s");
  if (s) {
    const [kind, seed] = s.split(".");
    if ((SEED_KINDS as readonly string[]).includes(kind)) out.seedKind = kind as SeedKind;
    const n = Number(seed);
    if (Number.isInteger(n) && n >= 0) out.seed = n;
  }
  return out;
}
