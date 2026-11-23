import { displayFrag, fieldFrag, quadVert, stepFrag } from "./shaders";

export interface SimParams {
  feed: number;
  kill: number;
  diffA: number;
  diffB: number;
  dt: number;
  map: boolean;
}

export interface Brush {
  x: number; // uv 0..1
  y: number;
  radius: number; // uv units (relative to height)
  mode: 0 | 1 | -1;
}

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer };

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error("shader compile failed: " + gl.getShaderInfoLog(s));
  }
  return s;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("program link failed: " + gl.getProgramInfoLog(p));
  }
  return p;
}

/** GPU Gray-Scott reaction-diffusion with ping-pong float framebuffers. */
export class Sim {
  readonly gl: WebGL2RenderingContext;
  width = 0;
  height = 0;
  private targets: [Target, Target] | null = null;
  private front = 0;
  private stepProg: WebGLProgram;
  private drawProg: WebGLProgram;
  private fieldProg: WebGLProgram;
  private field: Target | null = null;
  private uStep: Record<string, WebGLUniformLocation | null> = {};
  private uDraw: Record<string, WebGLUniformLocation | null> = {};

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("This GPU can't render to float textures (EXT_color_buffer_float).");
    }
    this.gl = gl;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.stepProg = program(gl, quadVert, stepFrag);
    this.drawProg = program(gl, quadVert, displayFrag);
    this.fieldProg = program(gl, quadVert, fieldFrag);
    for (const n of ["uState", "uTexel", "uFeed", "uKill", "uDiffA", "uDiffB", "uDt", "uMap", "uBrush", "uAspect"]) {
      this.uStep[n] = gl.getUniformLocation(this.stepProg, n);
    }
    for (const n of ["uField", "uSize", "uStops", "uShade"]) {
      this.uDraw[n] = gl.getUniformLocation(this.drawProg, n);
    }
  }

  private makeTarget(w: number, h: number, data: Float32Array | null, smooth = false): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (smooth) {
      // half-float is always filterable in WebGL2; RGBA32F is not
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    }
    const filter = smooth ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  }

  /** Allocate the grid. `seed` is an RGBA float buffer (r = A, g = B) or null for all-A. */
  reset(w: number, h: number, seed: Float32Array | null = null) {
    const gl = this.gl;
    if (this.targets) {
      for (const t of [...this.targets, this.field!]) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
    }
    this.width = w;
    this.height = h;
    if (!seed) {
      seed = new Float32Array(w * h * 4);
      for (let i = 0; i < w * h; i++) seed[i * 4] = 1;
    }
    this.targets = [this.makeTarget(w, h, seed), this.makeTarget(w, h, null)];
    this.field = this.makeTarget(w, h, null, true);
    this.front = 0;
  }

  step(p: SimParams, brush: Brush, iterations: number) {
    const gl = this.gl;
    const t = this.targets!;
    gl.useProgram(this.stepProg);
    gl.viewport(0, 0, this.width, this.height);
    gl.uniform1i(this.uStep.uState, 0);
    gl.uniform2f(this.uStep.uTexel, 1 / this.width, 1 / this.height);
    gl.uniform1f(this.uStep.uFeed, p.feed);
    gl.uniform1f(this.uStep.uKill, p.kill);
    gl.uniform1f(this.uStep.uDiffA, p.diffA);
    gl.uniform1f(this.uStep.uDiffB, p.diffB);
    gl.uniform1f(this.uStep.uDt, p.dt);
    gl.uniform1i(this.uStep.uMap, p.map ? 1 : 0);
    gl.uniform1f(this.uStep.uAspect, this.width / this.height);
    gl.activeTexture(gl.TEXTURE0);

    for (let i = 0; i < iterations; i++) {
      // only apply the brush on the first iteration of a frame
      const b = i === 0 ? brush : { ...brush, mode: 0 };
      gl.uniform4f(this.uStep.uBrush, b.x, b.y, b.radius, b.mode);
      const src = t[this.front];
      const dst = t[1 - this.front];
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.front = 1 - this.front;
    }
  }

  /** Draw the current state to the canvas. `stops` is 5 RGB triples in 0..1. */
  draw(stops: Float32Array, shade: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);

    // pass 1: state -> filterable height field, at simulation resolution
    gl.useProgram(this.fieldProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.field!.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.bindTexture(gl.TEXTURE_2D, this.targets![this.front].tex);
    gl.uniform1i(gl.getUniformLocation(this.fieldProg, "uState"), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // pass 2: bicubic upscale + shading, at screen resolution
    gl.useProgram(this.drawProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.field!.tex);
    gl.uniform1i(this.uDraw.uField, 0);
    gl.uniform2f(this.uDraw.uSize, this.width, this.height);
    gl.uniform3fv(this.uDraw.uStops, stops);
    gl.uniform1f(this.uDraw.uShade, shade);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

}
