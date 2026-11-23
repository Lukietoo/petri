/**
 * Initial conditions. Each returns an RGBA float grid where r = A and g = B.
 * Everything is deterministic for a given `rand` so URLs reproduce the same dish.
 */
export type SeedKind = "spots" | "ring" | "noise" | "grid" | "center";
export const SEED_KINDS: readonly SeedKind[] = ["spots", "ring", "noise", "grid", "center"];

/** mulberry32: tiny, fast, seedable PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emptyGrid(w: number, h: number): Float32Array {
  const g = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    g[i * 4] = 1;
    g[i * 4 + 3] = 1;
  }
  return g;
}

function stamp(g: Float32Array, w: number, h: number, cx: number, cy: number, r: number) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const wx = ((x % w) + w) % w;
      const wy = ((y % h) + h) % h;
      const i = (wy * w + wx) * 4;
      g[i] = 0.5;
      g[i + 1] = 1;
    }
  }
}

export function makeSeed(kind: SeedKind, w: number, h: number, seed: number): Float32Array {
  const g = emptyGrid(w, h);
  const rand = rng(seed);
  const unit = Math.max(2, Math.min(w, h) / 90);

  switch (kind) {
    case "spots": {
      const n = Math.round((w * h) / 9000) + 12;
      for (let i = 0; i < n; i++) stamp(g, w, h, rand() * w, rand() * h, unit * (1 + rand() * 2));
      break;
    }
    case "ring": {
      const r = Math.min(w, h) * 0.3;
      const steps = Math.ceil((2 * Math.PI * r) / unit);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        stamp(g, w, h, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, unit * 1.2);
      }
      break;
    }
    case "noise": {
      for (let i = 0; i < w * h; i++) {
        if (rand() < 0.08) {
          g[i * 4] = 0.5;
          g[i * 4 + 1] = 0.25 + rand() * 0.75;
        }
      }
      break;
    }
    case "grid": {
      const step = unit * 14;
      const ox = (rand() * step) | 0;
      const oy = (rand() * step) | 0;
      for (let y = oy; y < h; y += step) for (let x = ox; x < w; x += step) stamp(g, w, h, x, y, unit * 1.5);
      break;
    }
    case "center": {
      stamp(g, w, h, w / 2, h / 2, unit * 4);
      break;
    }
  }
  return g;
}

/** Fraction of cells where B is meaningfully present. Handy for tests and stats. */
export function coverage(g: Float32Array, threshold = 0.2): number {
  let n = 0;
  const cells = g.length / 4;
  for (let i = 0; i < cells; i++) if (g[i * 4 + 1] > threshold) n++;
  return n / cells;
}
