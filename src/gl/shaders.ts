import { MAP_RANGE } from "../core/state";

// GLSL sources for the simulation and display passes.

export const quadVert = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// One Gray-Scott integration step. State lives in .rg: r = A (substrate), g = B (catalyst).
export const stepFrag = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uFeed;
uniform float uKill;
uniform float uDiffA;
uniform float uDiffB;
uniform float uDt;
uniform bool uMap;        // vary feed/kill across the canvas
uniform vec4 uBrush;      // xy = uv position, z = radius (uv), w = mode (0 off, 1 paint, -1 erase)
uniform float uAspect;

vec2 lap(vec2 c) {
  vec2 sum = -c;
  sum += 0.2 * texture(uState, vUv + vec2( uTexel.x, 0.0)).rg;
  sum += 0.2 * texture(uState, vUv + vec2(-uTexel.x, 0.0)).rg;
  sum += 0.2 * texture(uState, vUv + vec2(0.0,  uTexel.y)).rg;
  sum += 0.2 * texture(uState, vUv + vec2(0.0, -uTexel.y)).rg;
  sum += 0.05 * texture(uState, vUv + uTexel).rg;
  sum += 0.05 * texture(uState, vUv - uTexel).rg;
  sum += 0.05 * texture(uState, vUv + vec2(uTexel.x, -uTexel.y)).rg;
  sum += 0.05 * texture(uState, vUv + vec2(-uTexel.x, uTexel.y)).rg;
  return sum;
}

void main() {
  vec2 c = texture(uState, vUv).rg;
  float a = c.r;
  float b = c.g;

  float feed = uFeed;
  float kill = uKill;
  if (uMap) {
    // Pearson's classic parameter map: feed along y, kill along x.
    feed = mix(${MAP_RANGE.feed[0].toFixed(4)}, ${MAP_RANGE.feed[1].toFixed(4)}, vUv.y);
    kill = mix(${MAP_RANGE.kill[0].toFixed(4)}, ${MAP_RANGE.kill[1].toFixed(4)}, vUv.x);
  }

  vec2 l = lap(c);
  float abb = a * b * b;
  a += (uDiffA * l.r - abb + feed * (1.0 - a)) * uDt;
  b += (uDiffB * l.g + abb - (kill + feed) * b) * uDt;

  if (uBrush.w != 0.0) {
    vec2 d = vUv - uBrush.xy;
    d.x *= uAspect;
    if (length(d) < uBrush.z) {
      if (uBrush.w > 0.0) { b = 1.0; } else { a = 1.0; b = 0.0; }
    }
  }

  outColor = vec4(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0), 0.0, 1.0);
}`;

// Pass 1 (sim resolution): collapse A/B into a single height value and write it to a
// half-float texture. Unlike RGBA32F, half-float textures can be linearly filtered on
// every WebGL2 device, which lets the next pass upscale smoothly.
export const fieldFrag = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
void main() {
  vec2 s = texture(uState, vUv).rg;
  outColor = vec4(clamp((s.g - s.r) * 0.5 + 0.5, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

// Pass 2 (screen resolution): bicubic-upscale the height field, colorize it through a
// 5-stop gradient, and light it with a cheap emboss for a wet, 3D look.
export const displayFrag = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uField;
uniform vec2 uSize;   // field size in texels
uniform vec3 uStops[5];
uniform float uShade;

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  float i = floor(t);
  float f = fract(t);
  if (i < 1.0) return mix(uStops[0], uStops[1], f);
  if (i < 2.0) return mix(uStops[1], uStops[2], f);
  if (i < 3.0) return mix(uStops[2], uStops[3], f);
  if (i < 4.0) return mix(uStops[3], uStops[4], f);
  return uStops[4];
}

// Cubic B-spline filtering in 4 bilinear taps (GPU Gems 2, ch. 20).
float val(vec2 uv) {
  vec2 p = uv * uSize - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / uSize;
  vec2 h1 = (i + 1.5 + w3 / g1) / uSize;
  float a = texture(uField, vec2(h0.x, h0.y)).r;
  float b = texture(uField, vec2(h1.x, h0.y)).r;
  float c = texture(uField, vec2(h0.x, h1.y)).r;
  float d = texture(uField, vec2(h1.x, h1.y)).r;
  // g0 + g1 == 1, so g0 is directly the weight of the h0 taps
  float top = mix(b, a, g0.x);
  float bot = mix(d, c, g0.x);
  return mix(bot, top, g0.y);
}

void main() {
  float v = val(vUv);

  // Treat the smooth field as a shape: everything above EDGE is "growth". The edge is
  // anti-aliased over ~1 screen pixel (fwidth), so outlines stay vector-crisp no matter
  // how far the simulation grid is upscaled.
  const float EDGE = 0.22;
  float aa = max(fwidth(v), 1e-4);
  float cover = smoothstep(EDGE - aa, EDGE + aa, v);

  // inside: tone runs from the mid stop at the rim to the brightest stop at the core
  // (a short, narrow range: a wide one leaves a pale ring that reads as fuzz)
  float depth = smoothstep(EDGE, EDGE + 0.2, v);
  vec3 inside = ramp(0.9 + 0.1 * depth);

  // outside: flat background with a thin, faint contact shadow right at the rim
  // (kept tight on purpose: a wide halo reads as blur)
  float near = smoothstep(EDGE * 0.85, EDGE, v);
  vec3 outside = uStops[0] * (1.0 - 0.12 * near * uShade);

  // gentle diffuse relief on the growth only
  vec2 e = 1.0 / uSize;
  float dx = val(vUv + vec2(e.x, 0.0)) - val(vUv - vec2(e.x, 0.0));
  float dy = val(vUv + vec2(0.0, e.y)) - val(vUv - vec2(0.0, e.y));
  vec3 n = normalize(vec3(-dx * 4.0, -dy * 4.0, 1.0));
  float light = dot(n, normalize(vec3(-0.5, 0.6, 0.65)));
  inside *= mix(1.0, clamp(0.8 + 0.3 * light, 0.75, 1.1), uShade);

  vec3 col = mix(outside, inside, cover);

  // gentle vignette keeps the eye in the middle and calms the edges
  float r = length((vUv - 0.5) * vec2(1.0, 0.85));
  col *= mix(1.0, 0.8, smoothstep(0.35, 0.85, r));

  outColor = vec4(col, 1.0);
}`;
