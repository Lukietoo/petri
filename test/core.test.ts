import { describe, expect, it } from "vitest";
import { PALETTES, hexToRgb, paletteUniform, sampleRamp } from "../src/core/palettes";
import { PRESETS, nearestPreset, presetById } from "../src/core/presets";
import { SEED_KINDS, coverage, makeSeed, rng } from "../src/core/seeds";
import { DEFAULTS, MAP_RANGE, decodeState, encodeState, mapToParams } from "../src/core/state";

describe("palettes", () => {
  it("parses hex colors", () => {
    expect(hexToRgb("#ffffff")).toEqual([1, 1, 1]);
    expect(hexToRgb("#000")).toEqual([0, 0, 0]);
    expect(hexToRgb("ff0000")).toEqual([1, 0, 0]);
    expect(() => hexToRgb("#zzz")).toThrow();
  });

  it("flattens to 15 floats for the shader", () => {
    for (const p of PALETTES) {
      const u = paletteUniform(p);
      expect(u).toHaveLength(15);
      expect([...u].every((v) => v >= 0 && v <= 1)).toBe(true);
    }
  });

  it("samples ramp endpoints exactly", () => {
    const p = PALETTES[0];
    expect(sampleRamp(p, 0)).toEqual(hexToRgb(p.stops[0]));
    expect(sampleRamp(p, 1)).toEqual(hexToRgb(p.stops[4]));
    expect(sampleRamp(p, -3)).toEqual(sampleRamp(p, 0));
  });

  it("has unique ids", () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
  });
});

describe("presets", () => {
  it("has unique ids and sane parameters", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      expect(p.feed).toBeGreaterThan(0);
      expect(p.feed).toBeLessThan(0.1);
      expect(p.kill).toBeGreaterThan(0.04);
      expect(p.kill).toBeLessThan(0.075);
    }
  });

  it("finds the nearest preset only within tolerance", () => {
    expect(nearestPreset(0.0545, 0.062)?.id).toBe("coral");
    expect(nearestPreset(0.0548, 0.0618)?.id).toBe("coral");
    expect(nearestPreset(0.1, 0.04)).toBeUndefined();
    expect(presetById("nope")).toBeUndefined();
  });
});

describe("seeds", () => {
  it("rng is deterministic and in [0, 1)", () => {
    const a = rng(5);
    const b = rng(5);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it.each(SEED_KINDS)("%s plants some catalyst but not too much", (kind) => {
    const g = makeSeed(kind, 120, 80, 11);
    expect(g).toHaveLength(120 * 80 * 4);
    const c = coverage(g);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(0.5);
  });

  it("same seed, same dish", () => {
    expect(makeSeed("spots", 64, 64, 3)).toEqual(makeSeed("spots", 64, 64, 3));
    expect(makeSeed("spots", 64, 64, 3)).not.toEqual(makeSeed("spots", 64, 64, 4));
  });
});

describe("state", () => {
  it("round-trips through the URL hash", () => {
    const s = { ...DEFAULTS, feed: 0.0367, kill: 0.0649, palette: "ember", seedKind: "ring" as const, seed: 4242, speed: 20 };
    const back = decodeState("#" + encodeState(s));
    expect(back).toMatchObject({ feed: 0.0367, kill: 0.0649, palette: "ember", seedKind: "ring", seed: 4242, speed: 20 });
  });

  it("ignores junk and clamps out-of-range values", () => {
    const s = decodeState("f=banana&k=9&c=notapalette&s=weird.-3&v=1000");
    expect(s.feed).toBeUndefined();
    expect(s.kill).toBe(0.08);
    expect(s.palette).toBeUndefined();
    expect(s.seedKind).toBeUndefined();
    expect(s.seed).toBeUndefined();
    expect(s.speed).toBe(40);
  });

  it("maps uv corners to the map range corners", () => {
    expect(mapToParams(0, 0)).toEqual({ feed: MAP_RANGE.feed[0], kill: MAP_RANGE.kill[0] });
    expect(mapToParams(1, 1)).toEqual({ feed: MAP_RANGE.feed[1], kill: MAP_RANGE.kill[1] });
    expect(mapToParams(5, -5)).toEqual({ feed: MAP_RANGE.feed[0], kill: MAP_RANGE.kill[1] });
  });
});
