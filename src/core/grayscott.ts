/**
 * CPU reference implementation of the same Gray-Scott step the shader runs.
 * Used by the tests and the headless renderer. Grids are RGBA float arrays
 * (r = A, g = B) with toroidal wrapping, matching the GPU's REPEAT sampling.
 */
export interface StepParams {
  feed: number;
  kill: number;
  diffA?: number;
  diffB?: number;
  dt?: number;
}

export class GrayScott {
  private a: Float32Array;
  private b: Float32Array;
  private na: Float32Array;
  private nb: Float32Array;

  constructor(readonly w: number, readonly h: number, seed: Float32Array) {
    if (seed.length !== w * h * 4) throw new Error(`seed has ${seed.length} floats, expected ${w * h * 4}`);
    const n = w * h;
    this.a = new Float32Array(n);
    this.b = new Float32Array(n);
    this.na = new Float32Array(n);
    this.nb = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.a[i] = seed[i * 4];
      this.b[i] = seed[i * 4 + 1];
    }
  }

  get A(): Float32Array {
    return this.a;
  }

  get B(): Float32Array {
    return this.b;
  }

  step(p: StepParams, iterations = 1) {
    const { w, h } = this;
    const da = p.diffA ?? 1;
    const db = p.diffB ?? 0.5;
    const dt = p.dt ?? 1;
    const { feed, kill } = p;

    for (let it = 0; it < iterations; it++) {
      const a = this.a;
      const b = this.b;
      const na = this.na;
      const nb = this.nb;
      for (let y = 0; y < h; y++) {
        const ym = ((y - 1 + h) % h) * w;
        const y0 = y * w;
        const yp = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
          const xm = (x - 1 + w) % w;
          const xp = (x + 1) % w;
          const i = y0 + x;
          const av = a[i];
          const bv = b[i];
          const la =
            -av +
            0.2 * (a[y0 + xm] + a[y0 + xp] + a[ym + x] + a[yp + x]) +
            0.05 * (a[ym + xm] + a[ym + xp] + a[yp + xm] + a[yp + xp]);
          const lb =
            -bv +
            0.2 * (b[y0 + xm] + b[y0 + xp] + b[ym + x] + b[yp + x]) +
            0.05 * (b[ym + xm] + b[ym + xp] + b[yp + xm] + b[yp + xp]);
          const abb = av * bv * bv;
          const nav = av + (da * la - abb + feed * (1 - av)) * dt;
          const nbv = bv + (db * lb + abb - (kill + feed) * bv) * dt;
          na[i] = nav < 0 ? 0 : nav > 1 ? 1 : nav;
          nb[i] = nbv < 0 ? 0 : nbv > 1 ? 1 : nbv;
        }
      }
      this.a = na;
      this.b = nb;
      this.na = a;
      this.nb = b;
    }
  }

  /** Fraction of cells where B exceeds the threshold. */
  coverage(threshold = 0.2): number {
    let n = 0;
    for (let i = 0; i < this.b.length; i++) if (this.b[i] > threshold) n++;
    return n / this.b.length;
  }

  /** Total mass of A and B, useful for sanity checks. */
  totals(): { a: number; b: number } {
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < this.a.length; i++) {
      sa += this.a[i];
      sb += this.b[i];
    }
    return { a: sa, b: sb };
  }
}
