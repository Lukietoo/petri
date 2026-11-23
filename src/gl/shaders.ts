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
    feed = mix(0.010, 0.090, vUv.y);
    kill = mix(0.045, 0.070, vUv.x);
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

// Colorize B through a 5-stop gradient, with a cheap emboss for a wet, 3D look.
export const displayFrag = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uState;
uniform vec2 uTexel;
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

float val(vec2 uv) {
  vec2 s = texture(uState, uv).rg;
  return clamp((s.g - s.r) * 0.5 + 0.5, 0.0, 1.0);
}

void main() {
  float v = val(vUv);
  // map: A-dominant regions sit near 0.0, dense B near ~0.7; stretch it.
  float t = smoothstep(0.08, 0.62, v);
  vec3 col = ramp(t);

  // emboss lighting from the upper-left
  float dx = val(vUv + vec2(uTexel.x, 0.0)) - val(vUv - vec2(uTexel.x, 0.0));
  float dy = val(vUv + vec2(0.0, uTexel.y)) - val(vUv - vec2(0.0, uTexel.y));
  vec3 n = normalize(vec3(-dx * 6.0, -dy * 6.0, 1.0));
  float light = dot(n, normalize(vec3(-0.5, 0.6, 0.65)));
  col *= mix(1.0, 0.55 + 0.6 * light, uShade);
  col += uShade * 0.35 * pow(max(light, 0.0), 24.0); // specular glint

  outColor = vec4(col, 1.0);
}`;
