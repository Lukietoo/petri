import { describe, expect, it } from "vitest";
import { GrayScott } from "../src/core/grayscott";
import { presetById } from "../src/core/presets";
import { emptyGrid, makeSeed } from "../src/core/seeds";

const coral = presetById("coral")!;

describe("GrayScott", () => {
  it("leaves a pure-A dish untouched", () => {
    const sim = new GrayScott(32, 32, emptyGrid(32, 32));
    sim.step(coral, 50);
    expect(sim.totals().b).toBe(0);
    expect(sim.A.every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
  });

  it("rejects mis-sized seeds", () => {
    expect(() => new GrayScott(10, 10, new Float32Array(12))).toThrow(/expected 400/);
  });

  it("keeps concentrations within [0, 1]", () => {
    const sim = new GrayScott(48, 48, makeSeed("noise", 48, 48, 3));
    sim.step({ feed: 0.026, kill: 0.051 }, 200);
    for (const arr of [sim.A, sim.B]) {
      for (const v of arr) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("coral grows outward from a small seed", () => {
    const sim = new GrayScott(96, 96, makeSeed("center", 96, 96, 1));
    const before = sim.coverage();
    sim.step(coral, 1500);
    expect(sim.coverage()).toBeGreaterThan(before * 3);
  });

  it("high kill rate wipes out the catalyst", () => {
    const sim = new GrayScott(64, 64, makeSeed("spots", 64, 64, 9));
    sim.step({ feed: 0.02, kill: 0.075 }, 1500);
    expect(sim.coverage()).toBe(0);
  });

  it("is deterministic", () => {
    const run = () => {
      const s = new GrayScott(40, 30, makeSeed("spots", 40, 30, 77));
      s.step(coral, 300);
      return s.B;
    };
    expect(run()).toEqual(run());
  });

  it("wraps around the edges (toroidal)", () => {
    const w = 40;
    const h = 40;
    const g = emptyGrid(w, h);
    // a seed straddling the left edge should leak across to the right edge
    for (let y = 18; y < 22; y++) {
      g[(y * w + 0) * 4] = 0.5;
      g[(y * w + 0) * 4 + 1] = 1;
    }
    const sim = new GrayScott(w, h, g);
    sim.step(coral, 30);
    expect(sim.B[20 * w + (w - 1)]).toBeGreaterThan(0.01);
  });
});
